import { QRCodeSVG } from "qrcode.react";

interface RoomQrCodeProps {
  joinUrl: string;
  size?: number;
}

/**
 * The one QR-generation call site in the app - the Host Invite Lobby
 * and the Stage Lobby both render this, so the join destination,
 * colors, and accessible title can never drift between the two places
 * a Player might scan a code from. `size` is the SVG's base pixel
 * size; callers that need it to scale further (see StagePage.css's
 * .stage-qr) do that in CSS on the wrapping element, not by changing
 * this component.
 */
function RoomQrCode({ joinUrl, size = 160 }: RoomQrCodeProps) {
  return (
    <QRCodeSVG
      value={joinUrl}
      size={size}
      bgColor="transparent"
      fgColor="#f5f3ff"
      title="Scan with a phone camera to join this game"
    />
  );
}

export default RoomQrCode;
