import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import PlaceholderPage from "../components/PlaceholderPage";

function HostControlPanelPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const joinUrl = `${window.location.origin}/join?room=${roomCode ?? ""}`;

  return (
    <PlaceholderPage
      eyebrow="Host Control Panel"
      title={`Room ${roomCode ?? ""}`}
      description="Question control, scoreboard, and live player management will live here. For now, here's a preview of the QR code players will scan to join."
    >
      <div className="qr-preview">
        <QRCodeSVG value={joinUrl} size={160} bgColor="transparent" fgColor="#f5f3ff" />
      </div>
    </PlaceholderPage>
  );
}

export default HostControlPanelPage;
