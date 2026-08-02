import { Link } from "react-router-dom";
import PlaceholderPage from "../components/PlaceholderPage";

function NotFoundPage() {
  return (
    <PlaceholderPage
      eyebrow="404"
      title="Nothing to see here"
      description="This page doesn't exist. Double-check the link, or head back to the home page."
    >
      <Link to="/" className="btn btn-ghost">
        Back to home
      </Link>
    </PlaceholderPage>
  );
}

export default NotFoundPage;
