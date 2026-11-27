// WebRTC Voice Channel Engine (Privacy-by-Default: mic starts OFF, voluntary join)
import { apiRequest } from '../services/apiClient.js';

const FALLBACK_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

export class VoiceEngine {
  constructor({ store, sendVoiceSignal, showToast }) {
    this.store = store;
    this.sendVoiceSignal = sendVoiceSignal;
    this.showToast = showToast;

    this.localStream = null;
    this.audioCtx = null;
    this.pcs = new Map(); // peerId -> RTCPeerConnection
    this.peerAudios = new Map(); // peerId -> { stream, source, gain, analyser, audioEl, dataArr, speaking }
    this.vadTimer = null;
    this.joined = false;
    this.micMuted = true;
    this.deafened = false;
    this.pttEnabled = false;
    this.pttActive = false;
    this.iceServers = FALLBACK_ICE;

    this.boundKeyDown = (e) => {
      if (!this.joined || !this.pttEnabled) return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.code === 'KeyV' && !e.repeat) {
        this.setPttActive(true);
      }
    };
    this.boundKeyUp = (e) => {
      if (!this.joined || !this.pttEnabled) return;
      if (e.code === 'KeyV') {
        this.setPttActive(false);
      }
    };
  }

  async refreshIceServers() {
    try {
      const data = await apiRequest('/api/rtc/ice');
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        this.iceServers = data.iceServers;
      }
    } catch {
      this.iceServers = FALLBACK_ICE;
    }
    return this.iceServers;
  }

  updateVoiceStore(patch) {
    const prev = this.store.getState().voice;
    this.store.setState({
      voice: { ...prev, ...patch }
    });
  }

  getSelfPeerEntry() {
    const id = this.store.getLocalIdentity();
    return {
      isSelf: true,
      name: id.name,
      avatarColor: id.avatarColor,
      avatarIcon: id.avatarIcon,
      micMuted: this.micMuted,
      volume: 1,
      localMuted: false,
      speaking: false
    };
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  async join() {
    if (this.joined) return;
    if (typeof RTCPeerConnection === 'undefined') {
      this.updateVoiceStore({ state: 'permission_error', error: 'WebRTC no soportado en este navegador' });
      this.showToast('WebRTC no disponible en este navegador');
      return;
    }

    this.joined = true;
    this.micMuted = true; // Privacy by default: always starts muted!
    this.pttActive = false;

    const myId = this.store.getLocalIdentity().id;
    this.updateVoiceStore({
      joined: true,
      state: 'connecting',
      micMuted: true,
      deafened: this.deafened,
      pttEnabled: this.pttEnabled,
      pttActive: false,
      peers: { [myId]: this.getSelfPeerEntry() },
      error: ''
    });

    await this.refreshIceServers();

    let nextState = 'connected';
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const micId = this.store.getState().settings.micDeviceId;
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: micId && micId !== 'default' ? { exact: micId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        this.applyLocalTrackMute();
      } else {
        nextState = 'mic_blocked';
      }
    } catch (err) {
      nextState = err?.name === 'NotAllowedError' ? 'permission_error' : 'mic_blocked';
      this.showToast('Sin acceso al micrófono: unido en modo solo escucha');
    }

    this.ensureAudioContext();
    this.startVadLoop();
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    this.updateVoiceStore({ state: nextState });
    this.sendVoiceSignal({ kind: 'VOICE_JOIN', profile: this.store.getLocalIdentity(), micMuted: this.micMuted });
  }

  leave() {
    if (!this.joined) return;
    this.joined = false;
    this.micMuted = true;
    this.pttActive = false;
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);

    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }

    this.sendVoiceSignal({ kind: 'VOICE_LEAVE' });

    for (const pc of this.pcs.values()) {
      try {
        pc.close();
      } catch {}
    }
    this.pcs.clear();

    for (const entry of this.peerAudios.values()) {
      try {
        entry.audioEl?.pause?.();
        entry.audioEl.srcObject = null;
        entry.source?.disconnect?.();
      } catch {}
    }
    this.peerAudios.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.updateVoiceStore({
      joined: false,
      state: 'disconnected',
      micMuted: true,
      pttActive: false,
      peers: {},
      error: ''
    });
  }

  applyLocalTrackMute() {
    if (!this.localStream) return;
    const active = this.pttEnabled ? this.pttActive : !this.micMuted;
    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = Boolean(active);
    });
  }

  async toggleMic() {
    if (!this.joined) return;
    if (!this.localStream) {
      try {
        const micId = this.store.getState().settings.micDeviceId;
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: micId && micId !== 'default' ? { exact: micId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        for (const pc of this.pcs.values()) {
          this.localStream.getAudioTracks().forEach((track) => {
            pc.addTrack(track, this.localStream);
          });
        }
        this.updateVoiceStore({ state: 'connected' });
      } catch {
        this.updateVoiceStore({ state: 'permission_error' });
        this.showToast('Permiso de micrófono denegado por el navegador');
        return;
      }
    }

    this.micMuted = !this.micMuted;
    this.applyLocalTrackMute();

    const myId = this.store.getLocalIdentity().id;
    const peers = { ...this.store.getState().voice.peers };
    if (peers[myId]) peers[myId] = { ...peers[myId], micMuted: this.micMuted };
    this.updateVoiceStore({ micMuted: this.micMuted, peers });

    this.sendVoiceSignal({ kind: 'VOICE_STATE', micMuted: this.micMuted });
  }

  toggleDeafen() {
    this.deafened = !this.deafened;
    for (const peerId of this.peerAudios.keys()) {
      this.applyPeerVolume(peerId);
    }
    this.updateVoiceStore({ deafened: this.deafened });
  }

  togglePtt() {
    this.pttEnabled = !this.pttEnabled;
    this.pttActive = false;
    this.micMuted = this.pttEnabled ? true : this.micMuted;
    this.applyLocalTrackMute();
    this.updateVoiceStore({
      pttEnabled: this.pttEnabled,
      pttActive: false,
      micMuted: this.micMuted
    });
    this.sendVoiceSignal({ kind: 'VOICE_STATE', micMuted: this.micMuted });
  }

  setPttActive(active) {
    if (!this.joined || !this.pttEnabled) return;
    this.pttActive = Boolean(active);
    this.micMuted = !this.pttActive;
    this.applyLocalTrackMute();

    const myId = this.store.getLocalIdentity().id;
    const peers = { ...this.store.getState().voice.peers };
    if (peers[myId]) peers[myId] = { ...peers[myId], micMuted: this.micMuted };
    this.updateVoiceStore({ pttActive: this.pttActive, micMuted: this.micMuted, peers });
    this.sendVoiceSignal({ kind: 'VOICE_STATE', micMuted: this.micMuted });
  }

  setPeerVolume(peerId, vol) {
    const peers = { ...this.store.getState().voice.peers };
    if (!peers[peerId]) return;
    peers[peerId] = { ...peers[peerId], volume: Math.max(0, Math.min(2, Number(vol) || 1)) };
    this.updateVoiceStore({ peers });
    this.applyPeerVolume(peerId);
  }

  togglePeerLocalMute(peerId) {
    const peers = { ...this.store.getState().voice.peers };
    if (!peers[peerId]) return;
    peers[peerId] = { ...peers[peerId], localMuted: !peers[peerId].localMuted };
    this.updateVoiceStore({ peers });
    this.applyPeerVolume(peerId);
  }

  applyPeerVolume(peerId) {
    const audioEntry = this.peerAudios.get(peerId);
    const peerInfo = this.store.getState().voice.peers?.[peerId];
    if (!audioEntry || !peerInfo) return;
    const muted = this.deafened || peerInfo.localMuted;
    const vol = muted ? 0 : Math.max(0, Math.min(2, Number(peerInfo.volume ?? 1)));
    if (audioEntry.gain) {
      audioEntry.gain.gain.value = vol;
    }
    if (audioEntry.audioEl) {
      audioEntry.audioEl.muted = muted;
      audioEntry.audioEl.volume = Math.min(1, vol);
    }
  }

  async setOutputDevice(deviceId) {
    for (const entry of this.peerAudios.values()) {
      if (entry.audioEl && typeof entry.audioEl.setSinkId === 'function') {
        try {
          await entry.audioEl.setSinkId(deviceId);
        } catch {}
      }
    }
  }

  createPeerConnection(remoteId, isInitiator) {
    if (this.pcs.has(remoteId)) {
      try {
        this.pcs.get(remoteId).close();
      } catch {}
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pcs.set(remoteId, pc);

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => pc.addTrack(track, this.localStream));
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendVoiceSignal({
          kind: 'VOICE_ICE',
          to: remoteId,
          candidate: ev.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.updateVoiceStore({ state: 'reconnecting' });
        if (isInitiator && typeof pc.restartIce === 'function') {
          try {
            pc.restartIce();
          } catch {}
        }
      } else if (pc.connectionState === 'connected') {
        this.updateVoiceStore({ state: this.localStream ? 'connected' : 'mic_blocked' });
      }
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams?.[0] || new MediaStream([ev.track]);
      this.attachRemoteStream(remoteId, stream);
    };

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.sendVoiceSignal({
            kind: 'VOICE_SDP',
            to: remoteId,
            sdp: pc.localDescription
          });
        })
        .catch(() => {});
    }

    return pc;
  }

  attachRemoteStream(peerId, stream) {
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.srcObject = stream;
    const speakerId = this.store.getState().settings.speakerDeviceId;
    if (speakerId && speakerId !== 'default' && typeof audioEl.setSinkId === 'function') {
      audioEl.setSinkId(speakerId).catch(() => {});
    }

    let source = null;
    let gain = null;
    let analyser = null;
    let dataArr = null;
    const ctx = this.ensureAudioContext();
    if (ctx) {
      try {
        source = ctx.createMediaStreamSource(stream);
        gain = ctx.createGain();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        dataArr = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
        audioEl.muted = true; // Audio plays through Web Audio GainNode for >100% boost & VAD
      } catch {
        audioEl.muted = false;
      }
    }

    this.peerAudios.set(peerId, { stream, source, gain, analyser, audioEl, dataArr, speaking: false });
    this.applyPeerVolume(peerId);
    audioEl.play().catch(() => {});
  }

  async handleSignal(fromId, signal) {
    if (!signal || !fromId) return;

    if (signal.kind === 'VOICE_JOIN') {
      if (!this.joined) return;
      const peers = { ...this.store.getState().voice.peers };
      peers[fromId] = {
        isSelf: false,
        name: signal.profile?.name || 'Jugador',
        avatarColor: signal.profile?.avatarColor || '#1ad1be',
        avatarIcon: signal.profile?.avatarIcon || '🎮',
        micMuted: Boolean(signal.micMuted),
        volume: peers[fromId]?.volume ?? 1,
        localMuted: peers[fromId]?.localMuted ?? false,
        speaking: false
      };
      this.updateVoiceStore({ peers });
      const myId = this.store.getLocalIdentity().id;
      const shouldInitiate = String(myId) > String(fromId);
      if (shouldInitiate) {
        this.createPeerConnection(fromId, true);
      }
      this.sendVoiceSignal({
        kind: 'VOICE_PRESENCE_SYNC',
        to: fromId,
        profile: this.store.getLocalIdentity(),
        micMuted: this.micMuted
      });
      return;
    }

    if (signal.kind === 'VOICE_PRESENCE_SYNC') {
      if (!this.joined) return;
      const peers = { ...this.store.getState().voice.peers };
      peers[fromId] = {
        isSelf: false,
        name: signal.profile?.name || 'Jugador',
        avatarColor: signal.profile?.avatarColor || '#1ad1be',
        avatarIcon: signal.profile?.avatarIcon || '🎮',
        micMuted: Boolean(signal.micMuted),
        volume: peers[fromId]?.volume ?? 1,
        localMuted: peers[fromId]?.localMuted ?? false,
        speaking: false
      };
      this.updateVoiceStore({ peers });
      return;
    }

    if (signal.kind === 'VOICE_STATE') {
      const peers = { ...this.store.getState().voice.peers };
      if (peers[fromId]) {
        peers[fromId] = { ...peers[fromId], micMuted: Boolean(signal.micMuted) };
        this.updateVoiceStore({ peers });
      }
      return;
    }

    if (signal.kind === 'VOICE_LEAVE') {
      const pc = this.pcs.get(fromId);
      if (pc) {
        try {
          pc.close();
        } catch {}
        this.pcs.delete(fromId);
      }
      this.peerAudios.delete(fromId);
      const peers = { ...this.store.getState().voice.peers };
      delete peers[fromId];
      this.updateVoiceStore({ peers });
      return;
    }

    if (!this.joined) return;

    if (signal.kind === 'VOICE_SDP' && signal.sdp) {
      let pc = this.pcs.get(fromId);
      if (!pc) pc = this.createPeerConnection(fromId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendVoiceSignal({ kind: 'VOICE_SDP', to: fromId, sdp: pc.localDescription });
      }
      return;
    }

    if (signal.kind === 'VOICE_ICE' && signal.candidate) {
      const pc = this.pcs.get(fromId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
      }
    }
  }

  startVadLoop() {
    if (this.vadTimer) clearInterval(this.vadTimer);
    this.vadTimer = setInterval(() => {
      if (!this.joined) return;
      let changed = false;
      const peers = { ...this.store.getState().voice.peers };
      for (const [peerId, entry] of this.peerAudios.entries()) {
        if (!entry.analyser || !entry.dataArr) continue;
        entry.analyser.getByteFrequencyData(entry.dataArr);
        let sum = 0;
        for (let i = 0; i < entry.dataArr.length; i++) sum += entry.dataArr[i];
        const avg = sum / entry.dataArr.length;
        const speaking = avg > 16;
        if (speaking !== entry.speaking) {
          entry.speaking = speaking;
          if (peers[peerId]) {
            peers[peerId] = { ...peers[peerId], speaking };
            changed = true;
          }
        }
      }
      if (changed) {
        this.updateVoiceStore({ peers });
      }
    }, 120);
  }
}
