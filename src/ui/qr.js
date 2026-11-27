import QRCode from 'qrcode';

export function buildRoomInviteUrl(roomCode) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

export async function renderRoomQr(canvasEl, roomCode) {
  if (!canvasEl || !roomCode) return;
  const inviteUrl = buildRoomInviteUrl(roomCode);
  await QRCode.toCanvas(canvasEl, inviteUrl, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#12161b',
      light: '#f5f2eb'
    }
  });
}
