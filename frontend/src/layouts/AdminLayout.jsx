import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { Layout, Menu, Avatar, Dropdown, ConfigProvider } from "antd";
import {
  DashboardOutlined,
  BookOutlined,
  ShoppingCartOutlined,
  HomeOutlined,
  LogoutOutlined,
  UserOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";

const { Sider, Header, Content } = Layout;

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Redirect if not admin
  if (!user || user.role !== "admin") {
    return <Navigate to="/login" replace />;
  }

  const menuItems = [
    {
      key: "/admin",
      icon: <DashboardOutlined />,
      label: <Link to="/admin">Dashboard</Link>,
    },
    {
      key: "/admin/books",
      icon: <BookOutlined />,
      label: <Link to="/admin/books">Quản lý sách</Link>,
    },
    {
      key: "/admin/categories",
      icon: <AppstoreOutlined />,
      label: <Link to="/admin/categories">Quản lý danh mục</Link>,
    },
    {
      key: "/admin/orders",
      icon: <ShoppingCartOutlined />,
      label: <Link to="/admin/orders">Quản lý đơn hàng</Link>,
    },
    {
      type: "divider",
    },
    {
      key: "back",
      icon: <HomeOutlined />,
      label: <Link to="/">Về cửa hàng</Link>,
    },
  ];

  const userMenuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Profile",
      disabled: true,
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      danger: true,
      onClick: () => {
        logout();
        window.location.href = "/";
      },
    },
  ];

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#6366f1",
          borderRadius: 8,
        },
      }}
    >
      <Layout className="min-h-screen">
        {/* Sidebar */}
        <Sider width={256} className="!bg-secondary-900" theme="dark">
          <div className="p-6">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <div>
                <span className="text-lg font-display font-bold text-white">
                  BookShop
                </span>
                <p className="text-xs text-secondary-400">Admin Panel</p>
              </div>
            </Link>
          </div>

          <Menu
            mode="inline"
            theme="dark"
            selectedKeys={[location.pathname]}
            items={menuItems}
            className="!bg-transparent !border-none"
            style={{ borderInlineEnd: "none" }}
          />
        </Sider>

        {/* Main Content */}
        <Layout>
          <Header className="!bg-white !px-6 flex items-center justify-between shadow-sm">
            <div className="text-lg font-semibold text-secondary-800">
              {location.pathname === "/admin" && "Dashboard"}
              {location.pathname === "/admin/books" && "Quản lý sách"}
              {location.pathname === "/admin/categories" && "Quản lý danh mục"}
              {location.pathname === "/admin/orders" && "Quản lý đơn hàng"}
            </div>

            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors">
                <span className="text-secondary-600">Welcome, {user.name}</span>
                <Avatar
                  size={40}
                  className="!bg-gradient-to-br from-primary-500 to-primary-600"
                >
                  {user.name.charAt(0).toUpperCase()}
                </Avatar>
              </div>
            </Dropdown>
          </Header>

          <Content className="p-6 bg-gray-50">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
