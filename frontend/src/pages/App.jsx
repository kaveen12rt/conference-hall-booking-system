import AdminPage from "./AdminPage.jsx";
import BookingPage from "./BookingPage.jsx";
import DigitalNetworkBackground from "../components/DigitalNetworkBackground.jsx";
import { PreferencesProvider } from "../context/PreferencesContext.jsx";

export default function App() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");

  return (
    <PreferencesProvider>
      <DigitalNetworkBackground />
      {isAdminRoute ? <AdminPage /> : <BookingPage />}
    </PreferencesProvider>
  );
}
