import { Outlet, useLocation } from "react-router-dom";
import SideBar from "../components/SideBar";

const MainLayout = () => {
  const location = useLocation();

  const hiddenRoutes = ["/result-notes", "/balance-sheet/processed", "/profit-loss/processed"];

  const showSidebar =
    location.pathname.startsWith("/dashboard") &&
    !hiddenRoutes.some(route => location.pathname.includes(route));

  return (
    <div className="flex min-h-screen bg-paper">
      {showSidebar && <SideBar />}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
