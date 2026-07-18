import { Outlet } from "react-router-dom";

export default function RootLayout() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
    </>
  );
}
