import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Tag, Typography, Spin } from "antd";
import {
  BookOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  FireOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { adminAPI, booksAPI } from "../../services/api.js";
import { formatVND } from "../../utils/format.js";

const { Title, Text } = Typography;

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [topBooks, setTopBooks] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsRes, ordersRes, booksRes] = await Promise.all([
          adminAPI.getStats(),
          adminAPI.getOrders({ limit: 5 }),
          booksAPI.getBestSellers(5),
        ]);

        if (statsRes.success) setStats(statsRes.data);
        if (ordersRes.success) setRecentOrders(ordersRes.data.orders || []);
        if (booksRes.success) setTopBooks(booksRes.data.books || []);
      } catch (error) {
        console.error("Dashboard error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const orderColumns = [
    {
      title: "Mã đơn",
      dataIndex: "_id",
      key: "_id",
      render: (id) => (
        <Link
          to={`/admin/orders`}
          className="text-primary-600 font-medium hover:underline"
        >
          #{(id || "").slice(-8).toUpperCase()}
        </Link>
      ),
    },
    {
      title: "Ngày",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date) => new Date(date).toLocaleDateString("vi-VN"),
    },
    {
      title: "Sản phẩm",
      dataIndex: "items",
      key: "items",
      render: (items) => items?.length || 0,
    },
    {
      title: "Tổng tiền",
      dataIndex: "totalAmount",
      key: "totalAmount",
      render: (amount) => (
        <span className="font-semibold">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        const statusMap = {
          pending: { color: "orange", text: "Chờ xử lý" },
          processing: { color: "blue", text: "Đang xử lý" },
          shipped: { color: "cyan", text: "Đang giao" },
          delivered: { color: "green", text: "Đã giao" },
          completed: { color: "green", text: "Hoàn thành" },
          cancelled: { color: "red", text: "Đã hủy" },
        };
        const s = statusMap[status] || { color: "default", text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
  ];

  const bookColumns = [
    {
      title: "Hạng",
      key: "rank",
      width: 60,
      render: (_, __, index) => (
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            index === 0
              ? "bg-amber-500 text-white"
              : index === 1
              ? "bg-gray-400 text-white"
              : index === 2
              ? "bg-amber-700 text-white"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {index + 1}
        </div>
      ),
    },
    {
      title: "Sách",
      dataIndex: "title",
      key: "title",
      render: (title, record) => (
        <div className="flex items-center gap-3">
          <img
            src={record.imageUrl}
            alt={title}
            className="w-10 h-14 object-cover rounded"
          />
          <div>
            <div className="font-medium text-secondary-800 line-clamp-1">
              {title}
            </div>
            <div className="text-xs text-secondary-500">{record.author}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Đã bán",
      dataIndex: "sold",
      key: "sold",
      render: (count) => (
        <span className="font-semibold text-primary-600">{count || 0}</span>
      ),
    },
    {
      title: "Doanh thu",
      key: "revenue",
      render: (_, record) => (
        <span className="font-semibold">
          {formatVND((record.sold || 0) * record.price)}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  const totalBooks = stats?.books?.total || 0;
  const totalStock = stats?.books?.totalStock || 0;
  const totalSold = stats?.books?.totalSold || 0;
  const totalOrders = stats?.orders?.totalOrders || 0;
  const totalRevenue = stats?.orders?.totalRevenue || 0;
  const pendingOrders = stats?.orders?.statusCounts?.pending || 0;
  const totalUsers = stats?.users || 0;

  return (
    <div className="space-y-6">
      <div>
        <Title level={2} className="!mb-1">
          Tổng quan
        </Title>
        <Text type="secondary">
          Chào mừng trở lại! Đây là tình hình cửa hàng của bạn.
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="shadow-sm hover:shadow-md transition-shadow"
          >
            <Statistic
              title={<span className="text-secondary-500">Tổng sách</span>}
              value={totalBooks}
              prefix={<BookOutlined className="text-primary-500" />}
              suffix={
                <span className="text-sm text-secondary-400">
                  / {totalStock} trong kho
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="shadow-sm hover:shadow-md transition-shadow"
          >
            <Statistic
              title={<span className="text-secondary-500">Tổng đơn hàng</span>}
              value={totalOrders}
              prefix={<ShoppingCartOutlined className="text-blue-500" />}
              suffix={
                pendingOrders > 0 && (
                  <Tag color="orange" className="ml-2">
                    {pendingOrders} chờ xử lý
                  </Tag>
                )
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="shadow-sm hover:shadow-md transition-shadow"
          >
            <Statistic
              title={<span className="text-secondary-500">Doanh thu</span>}
              value={formatVND(totalRevenue)}
              prefix={<DollarOutlined className="text-green-500" />}
              valueStyle={{ color: "#10b981", fontSize: "20px" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="shadow-sm hover:shadow-md transition-shadow"
          >
            <Statistic
              title={<span className="text-secondary-500">Sách đã bán</span>}
              value={totalSold}
              prefix={<RiseOutlined className="text-purple-500" />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={
              <div className="flex items-center gap-2">
                <ClockCircleOutlined className="text-primary-500" />
                <span>Đơn hàng gần đây</span>
              </div>
            }
            extra={
              <Link
                to="/admin/orders"
                className="text-primary-600 hover:underline"
              >
                Xem tất cả
              </Link>
            }
            bordered={false}
            className="shadow-sm"
          >
            <Table
              columns={orderColumns}
              dataSource={recentOrders}
              rowKey={(r) => r._id || r.id}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={
              <div className="flex items-center gap-2">
                <FireOutlined className="text-orange-500" />
                <span>Sách bán chạy</span>
              </div>
            }
            extra={
              <Link
                to="/admin/books"
                className="text-primary-600 hover:underline"
              >
                Xem tất cả
              </Link>
            }
            bordered={false}
            className="shadow-sm"
          >
            <Table
              columns={bookColumns}
              dataSource={topBooks}
              rowKey={(r) => r._id || r.id}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
