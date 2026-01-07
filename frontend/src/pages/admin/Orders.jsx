import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Select,
  Modal,
  Tag,
  Space,
  Typography,
  Descriptions,
  message,
  Divider,
  Spin,
  Empty,
} from "antd";
import {
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ShoppingOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { adminAPI, booksAPI } from "../../services/api.js";
import { formatVND } from "../../utils/format.js";

const { Title, Text } = Typography;

const statusConfig = {
  pending: {
    color: "orange",
    icon: <ClockCircleOutlined />,
    label: "Chờ xử lý",
  },
  processing: {
    color: "blue",
    icon: <ClockCircleOutlined />,
    label: "Đang xử lý",
  },
  shipped: { color: "cyan", icon: <ShoppingOutlined />, label: "Đang giao" },
  delivered: {
    color: "green",
    icon: <CheckCircleOutlined />,
    label: "Đã giao",
  },
  completed: {
    color: "green",
    icon: <CheckCircleOutlined />,
    label: "Hoàn thành",
  },
  cancelled: { color: "red", icon: <CloseCircleOutlined />, label: "Đã hủy" },
};

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [books, setBooks] = useState({});
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Fetch orders from API
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getOrders();
      console.log("Orders API response:", res);
      if (res.success) {
        setOrders(res.data.orders || []);

        // Fetch book images
        const bookIds = new Set();
        res.data.orders.forEach((order) => {
          order.items?.forEach((item) => {
            const bookId = item.book?._id || item.book || item.bookId;
            if (bookId) bookIds.add(bookId);
          });
        });

        const booksData = {};
        for (const bookId of bookIds) {
          try {
            const bookRes = await booksAPI.getById(bookId);
            if (bookRes.success) {
              booksData[bookId] = bookRes.data.book;
            }
          } catch (e) {}
        }
        setBooks(booksData);
      } else {
        message.error("Không thể tải đơn hàng");
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      message.error("Lỗi khi tải đơn hàng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    if (!statusFilter) return orders;
    return orders.filter((order) => order.status === statusFilter);
  }, [orders, statusFilter]);

  // Statistics
  const stats = useMemo(
    () => ({
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter(
        (o) => o.status === "completed" || o.status === "delivered"
      ).length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
    }),
    [orders]
  );

  // Open detail modal
  const openModal = (order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  // Update order status
  const updateStatus = async (orderId, newStatus) => {
    try {
      setUpdatingStatus(true);
      const res = await adminAPI.updateOrderStatus(orderId, newStatus);
      if (res.success) {
        message.success(`Cập nhật trạng thái thành công`);
        fetchOrders(); // Reload orders
        setIsModalOpen(false);
      } else {
        message.error(res.message || "Lỗi cập nhật trạng thái");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      message.error("Có lỗi xảy ra");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const columns = [
    {
      title: "Mã đơn hàng",
      key: "id",
      render: (_, record) => {
        const id = record._id || record.id || "";
        return (
          <span className="font-medium text-primary-600">
            #{id.slice(-8).toUpperCase()}
          </span>
        );
      },
    },
    {
      title: "Khách hàng",
      key: "customer",
      render: (_, record) => (
        <div>
          <div className="font-medium text-secondary-800">
            {record.shippingAddress?.fullName}
          </div>
          <div className="text-sm text-secondary-500">
            {record.shippingAddress?.phone}
          </div>
        </div>
      ),
    },
    {
      title: "Ngày đặt",
      dataIndex: "createdAt",
      key: "createdAt",
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      render: (date) =>
        date ? new Date(date).toLocaleDateString("vi-VN") : "-",
    },
    {
      title: "Sản phẩm",
      dataIndex: "items",
      key: "items",
      render: (items) => (
        <div className="flex items-center gap-1">
          <ShoppingOutlined className="text-secondary-400" />
          <span>{items?.length || 0}</span>
        </div>
      ),
    },
    {
      title: "Tổng tiền",
      dataIndex: "totalAmount",
      key: "totalAmount",
      sorter: (a, b) => (a.totalAmount || 0) - (b.totalAmount || 0),
      render: (amount) => (
        <span className="font-semibold text-primary-600">
          {formatVND(amount || 0)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        const config = statusConfig[status] || statusConfig.pending;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => openModal(record)}
          className="text-blue-500 hover:text-blue-600"
        >
          Xem
        </Button>
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <Title level={2} className="!mb-1">
            Quản lý đơn hàng
          </Title>
          <Text type="secondary">Theo dõi và quản lý tất cả đơn hàng</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchOrders}>
          Tải lại
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card
          bordered={false}
          className={`shadow-sm cursor-pointer transition-all ${
            !statusFilter ? "ring-2 ring-primary-500" : "hover:shadow-md"
          }`}
          onClick={() => setStatusFilter("")}
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-secondary-800">
              {stats.total}
            </div>
            <div className="text-secondary-500 text-sm">Tổng đơn</div>
          </div>
        </Card>
        <Card
          bordered={false}
          className={`shadow-sm cursor-pointer transition-all ${
            statusFilter === "pending"
              ? "ring-2 ring-orange-500"
              : "hover:shadow-md"
          }`}
          onClick={() => setStatusFilter("pending")}
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">
              {stats.pending}
            </div>
            <div className="text-secondary-500 text-sm">Chờ xử lý</div>
          </div>
        </Card>
        <Card
          bordered={false}
          className={`shadow-sm cursor-pointer transition-all ${
            statusFilter === "completed"
              ? "ring-2 ring-green-500"
              : "hover:shadow-md"
          }`}
          onClick={() => setStatusFilter("completed")}
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">
              {stats.completed}
            </div>
            <div className="text-secondary-500 text-sm">Hoàn thành</div>
          </div>
        </Card>
        <Card
          bordered={false}
          className={`shadow-sm cursor-pointer transition-all ${
            statusFilter === "cancelled"
              ? "ring-2 ring-red-500"
              : "hover:shadow-md"
          }`}
          onClick={() => setStatusFilter("cancelled")}
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">
              {stats.cancelled}
            </div>
            <div className="text-secondary-500 text-sm">Đã hủy</div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card bordered={false} className="shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Text type="secondary">Lọc theo trạng thái:</Text>
          <Select
            value={statusFilter || "all"}
            onChange={(value) => setStatusFilter(value === "all" ? "" : value)}
            className="w-40"
            options={[
              { value: "all", label: "Tất cả" },
              { value: "pending", label: "Chờ xử lý" },
              { value: "processing", label: "Đang xử lý" },
              { value: "shipped", label: "Đang giao" },
              { value: "completed", label: "Hoàn thành" },
              { value: "cancelled", label: "Đã hủy" },
            ]}
          />
          {statusFilter && (
            <Button type="link" onClick={() => setStatusFilter("")}>
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card bordered={false} className="shadow-sm">
        <Table
          columns={columns}
          dataSource={filteredOrders}
          rowKey={(r) => r._id || r.id}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} của ${total} đơn hàng`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có đơn hàng nào"
              />
            ),
          }}
        />
      </Card>

      {/* Order Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ShoppingOutlined className="text-primary-500" />
            <span>Chi tiết đơn hàng</span>
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={700}
      >
        {selectedOrder && (
          <div className="mt-4 space-y-6">
            {/* Order Info */}
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Mã đơn" span={1}>
                <span className="font-medium">
                  #
                  {(selectedOrder._id || selectedOrder.id || "")
                    .slice(-8)
                    .toUpperCase()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày đặt" span={1}>
                {selectedOrder.createdAt
                  ? new Date(selectedOrder.createdAt).toLocaleDateString(
                      "vi-VN"
                    )
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái" span={2}>
                {(() => {
                  const config =
                    statusConfig[selectedOrder.status] || statusConfig.pending;
                  return (
                    <Tag color={config.color} icon={config.icon}>
                      {config.label}
                    </Tag>
                  );
                })()}
              </Descriptions.Item>
            </Descriptions>

            {/* Customer Info */}
            <div>
              <Title level={5}>Thông tin khách hàng</Title>
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Họ tên">
                  {selectedOrder.shippingAddress?.fullName}
                </Descriptions.Item>
                <Descriptions.Item label="Điện thoại">
                  {selectedOrder.shippingAddress?.phone}
                </Descriptions.Item>
                <Descriptions.Item label="Địa chỉ">
                  {selectedOrder.shippingAddress?.address}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* Order Items */}
            <div>
              <Title level={5}>
                Sản phẩm ({selectedOrder.items?.length || 0})
              </Title>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {selectedOrder.items?.map((item, index) => {
                  const bookId = item.book?._id || item.book || item.bookId;
                  const book = books[bookId];
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                    >
                      <img
                        src={
                          book?.imageUrl || "https://via.placeholder.com/60x80"
                        }
                        alt={item.title}
                        className="w-12 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-secondary-800">
                          {item.title}
                        </div>
                        <div className="text-sm text-secondary-500">
                          {formatVND(item.price)} × {item.quantity}
                        </div>
                      </div>
                      <div className="font-semibold text-primary-600">
                        {formatVND(item.price * item.quantity)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Divider />

            {/* Order Total */}
            <div className="flex justify-between items-center text-lg">
              <span className="font-semibold text-secondary-800">
                Tổng tiền
              </span>
              <span className="text-2xl font-bold text-primary-600">
                {formatVND(selectedOrder.totalAmount || 0)}
              </span>
            </div>

            {/* Status Update Actions */}
            {selectedOrder.status === "pending" && (
              <>
                <Divider />
                <div>
                  <Title level={5}>Cập nhật trạng thái</Title>
                  <Space>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={() =>
                        updateStatus(
                          selectedOrder._id || selectedOrder.id,
                          "completed"
                        )
                      }
                      loading={updatingStatus}
                      className="bg-green-500 hover:bg-green-600 border-green-500"
                    >
                      Hoàn thành
                    </Button>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() =>
                        updateStatus(
                          selectedOrder._id || selectedOrder.id,
                          "cancelled"
                        )
                      }
                      loading={updatingStatus}
                    >
                      Hủy đơn
                    </Button>
                  </Space>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
