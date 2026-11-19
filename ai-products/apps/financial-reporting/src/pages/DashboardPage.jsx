import  { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Scale } from "lucide-react";

import {
  LayoutGrid,
  Upload,
  Clock,
  TrendingUp,
  FileText,
  Bell,
  User,
  LogOut,
  History,
  Settings,
  HelpCircle,
  Eye,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";
import { apiUrl } from "../lib/apiPath";
import { timeAgo, formatDuration, useActivity } from "../lib/activity";
import AISummaryCard from "../components/AISummaryCard";


const DashboardPage = () => {

 
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);

  // Real activity from the backend (uploads, statements, downloads, emails)
  const { data: activity, notifications, markAsRead, markAllAsRead, deleteNotification } = useActivity();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;



  const st = activity?.stats;
  const analytics = [
    { title: "Total Documents Processed", value: st ? st.documentsProcessed.toLocaleString("en-IN") : "…", icon: <FileText className="w-6 h-6 text-blue-500" /> },
    { title: "Today's Files", value: st ? String(st.filesToday) : "…", icon: <Upload className="w-6 h-6 text-purple-500" /> },
    { title: "Avg Processing Time", value: !st ? "…" : st.avgProcessingMs == null ? "No runs yet" : formatDuration(st.avgProcessingMs), icon: <Clock className="w-6 h-6 text-green-500" /> },
    { title: "Success Rate", value: !st ? "…" : st.successRate == null ? "No runs yet" : `${st.successRate}%`, icon: <TrendingUp className="w-6 h-6 text-emerald-500" /> },
  ];

  const recentUploads = (activity?.uploads || []).map((e) => ({
    name: e.file || e.title,
    time: new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    status: e.ok ? "Completed" : "Failed",
    detail: e.title,
  }));

  return (
    <div className="flex h-screen bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20 font-sans">
      {/* ------------------ SIDEBAR ------------------ */}


      {/* ------------------ MAIN CONTENT ------------------ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ---------- TOP BAR ---------- */}
        <header className="flex items-center justify-between bg-[#FFFFFF]/80 backdrop-blur-xl px-6 lg:px-8 py-4 lg:py-5 shadow-premium border-b border-[#dde3da]/50">
          <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-[#0b1a33] tracking-[-0.01em] leading-[1.3]">
            Trial Balance
            <span className="block text-sm font-normal text-[#566176] mt-0.5">Trial balance to Schedule III statements, notes and AI insights</span>
          </h1>

          <div className="flex items-center space-x-4">
            {/* Notifications Dropdown */}
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative text-gray-500 hover:text-gray-700 transition-colors"
              >
              <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown Menu */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {/* Notifications List */}
                  <div className="overflow-y-auto max-h-80">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-500 text-sm">
                        No notifications
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`px-4 py-3 hover:bg-gray-50 transition-colors ${
                              !notification.read ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`mt-0.5 ${
                                  notification.type === 'success' ? 'text-green-500' :
                                  notification.type === 'warning' ? 'text-yellow-500' :
                                  'text-blue-500'
                                }`}>
                                  {notification.type === 'success' ? (
                                    <CheckCircle className="w-5 h-5" />
                                  ) : notification.type === 'warning' ? (
                                    <AlertCircle className="w-5 h-5" />
                                  ) : (
                                    <Bell className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900">
                                      {notification.title}
                                    </p>
                                    {!notification.read && (
                                      <span className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1">
                                    {notification.message}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {timeAgo(notification.at)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {!notification.read && (
                                  <button
                                    onClick={() => markAsRead(notification.id)}
                                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                                    title="Mark as read"
                                  >
                                    <CheckCircle className="w-4 h-4 text-gray-400" />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteNotification(notification.id)}
                                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                                  title="Delete"
                                >
                                  <X className="w-4 h-4 text-gray-400" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                      <button
                        onClick={() => navigate("/dashboard/history")}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium w-full text-center"
                      >
                        View all activity
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ---------- DASHBOARD CONTENT ---------- */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
            {/* ---- AI SUMMARY REPORT (DeepSeek) ---- */}
            <AISummaryCard />

            {/* ---- A. ANALYTICS CARDS ---- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {analytics.map((card, i) => (
              <div
                key={i}
                className="group bg-[#FFFFFF] p-6 rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#dde3da]/60 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:border-[#dde3da] hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
                    {card.icon}
                  </div>
                </div>
                <div>
                  <p className="text-[#3a4659] text-sm font-medium mb-2">{card.title}</p>
                  <h2 className="text-2xl md:text-3xl font-bold text-[#0b1a33] tracking-[-0.01em] leading-[1.2]">
                    {card.value}
                  </h2>
                </div>
              </div>
            ))}
          </div>

            {/* ---- B. RECENT UPLOADS TABLE ---- */}
            <div className="bg-[#FFFFFF] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#dde3da]/60 overflow-hidden">
              <div className="px-5 lg:px-6 py-4 lg:py-5 border-b border-[#dde3da] bg-gradient-to-r from-[#f3f5f1]/50 to-transparent">
                <h3 className="text-base lg:text-lg font-semibold text-[#0b1a33] tracking-[-0.01em] leading-[1.3]">
                  Recent Uploads
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[#3a4659] bg-[#f3f5f1]/80 border-b border-[#dde3da]">
                      <th className="py-3 lg:py-4 px-4 lg:px-6 font-semibold text-xs uppercase tracking-wider">Document Name</th>
                      <th className="py-3 lg:py-4 px-4 lg:px-6 font-semibold text-xs uppercase tracking-wider">Upload Time</th>
                      <th className="py-3 lg:py-4 px-4 lg:px-6 font-semibold text-xs uppercase tracking-wider">Status</th>
                      {/* <th className="py-3 lg:py-4 px-4 lg:px-6 font-semibold text-xs uppercase tracking-wider">Actions</th> */}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dde3da]">
                    {activity && recentUploads.length === 0 && (
                      <tr><td colSpan={3} className="py-8 px-6 text-center text-[#566176]">No uploads yet. Upload a trial balance to get started.</td></tr>
                    )}
                    {recentUploads.map((file, index) => (
                      <tr
                        key={index}
                        className="bg-[#FFFFFF] hover:bg-blue-50/30 transition-colors duration-150"
                      >
                        <td className="py-3 lg:py-4 px-4 lg:px-6 font-medium text-[#0b1a33]">
                          {file.name}
                          <span className="block text-xs font-normal text-[#566176]">{file.detail}</span>
                        </td>
                        <td className="py-3 lg:py-4 px-4 lg:px-6 text-[#3a4659]">{file.time}</td>
                        <td className="py-3 lg:py-4 px-4 lg:px-6">
                          <span
                            className={`inline-flex px-3 py-1.5 text-xs font-semibold rounded-full ${
                              file.status === "Completed"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {file.status}
                          </span>
                        </td>
                        {/* <td className="py-3 lg:py-4 px-4 lg:px-6">
                          <div className="flex items-center space-x-2 lg:space-x-3">
                            <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200" title="View">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200" title="Download">
                              <Download className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td> */}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- C. QUICK ACTIONS BAR ---- */}
            <div className="flex flex-wrap gap-3 lg:gap-4 justify-center lg:justify-end pt-2">
              <button 
                onClick={() => navigate("/dashboard/upload")}
                className="bg-gradient-to-r from-[#1d7a73] to-[#4fb3ac] hover:from-[#1b315e] hover:to-[#1b315e] text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-[#1d7a73]/30 hover:shadow-xl hover:shadow-[#1d7a73]/40 transform hover:scale-[1.02] transition-all duration-300"
              >
                Upload Document
              </button>
              <button onClick={() => navigate("/dashboard/history")} className="border-2 border-[#dde3da] hover:border-[#dde3da] text-[#3a4659] px-6 py-3 rounded-xl font-semibold hover:bg-[#f3f5f1] transition-all duration-200 shadow-sm hover:shadow-md">
                View All Documents
              </button>
              <button onClick={() => navigate("/dashboard/support")} className="border-2 border-blue-200 hover:border-blue-300 text-[#1d7a73] px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-all duration-200 shadow-sm hover:shadow-md">
                Support
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// --- Sidebar Link Component ---
const SidebarLink = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 text-left group ${
      active 
        ? "text-[#1d7a73] bg-[#eef6f5]/60" 
        : "text-[#566176] hover:text-[#0b1a33] hover:bg-[#f3f5f1]"
    }`}
  >
    {/* Subtle active indicator */}
    {active && (
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#1d7a73] rounded-r-full"></div>
    )}
    <span className={`flex-shrink-0 mr-3 transition-colors duration-200 ${
      active ? 'text-[#1d7a73]' : 'text-[#9aa7bd] group-hover:text-[#3a4659]'
    }`}>
      {icon}
    </span>
    <span className="flex-1">{label}</span>
  </button>
);

export default DashboardPage;

