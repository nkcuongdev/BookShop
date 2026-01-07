import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Tag,
  Space,
  Popconfirm,
  message,
  Typography,
  Image,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { booksAPI, categoriesAPI } from "../../services/api.js";
import { formatVND } from "../../utils/format.js";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function AdminBooks() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [imagePreview, setImagePreview] = useState("");

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [booksRes, categoriesRes] = await Promise.all([
          booksAPI.getAll(),
          categoriesAPI.getAll(),
        ]);
        console.log("Books response:", booksRes);
        console.log("Categories response:", categoriesRes);
        console.log("Categories data:", categoriesRes.data);
        console.log("Categories array:", categoriesRes.data?.categories);

        if (booksRes.success) setBooks(booksRes.data.books || []);
        if (categoriesRes.success) {
          const cats = categoriesRes.data.categories || [];
          console.log("Setting categories:", cats, "length:", cats.length);
          setCategories(cats);
        } else {
          console.error("Failed to load categories:", categoriesRes);
        }
      } catch (error) {
        console.error("Fetch error:", error);
        message.error("Không thể tải dữ liệu");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filtered books
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const matchesSearch =
        !searchText ||
        book.title.toLowerCase().includes(searchText.toLowerCase()) ||
        book.author.toLowerCase().includes(searchText.toLowerCase());
      const matchesCategory =
        !categoryFilter || book.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [books, searchText, categoryFilter]);

  const openModal = (book = null) => {
    setEditingBook(book);
    if (book) {
      form.setFieldsValue(book);
      setImagePreview(book.imageUrl);
    } else {
      form.resetFields();
      setImagePreview("");
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingBook) {
        const res = await booksAPI.update(
          editingBook._id || editingBook.id,
          values
        );
        if (res.success) {
          setBooks((prev) =>
            prev.map((book) =>
              (book._id || book.id) === (editingBook._id || editingBook.id)
                ? { ...book, ...res.data.book }
                : book
            )
          );
          message.success("Cập nhật sách thành công!");
        }
      } else {
        const res = await booksAPI.create(values);
        if (res.success) {
          setBooks((prev) => [res.data.book, ...prev]);
          message.success("Thêm sách thành công!");
        }
      }

      setIsModalOpen(false);
      form.resetFields();
      setImagePreview("");
    } catch (error) {
      message.error(error.message || "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (bookId) => {
    try {
      const res = await booksAPI.delete(bookId);
      if (res.success) {
        setBooks((prev) =>
          prev.filter((book) => (book._id || book.id) !== bookId)
        );
        message.success("Xóa sách thành công!");
      }
    } catch (error) {
      message.error(error.message || "Không thể xóa sách");
    }
  };

  const handleImageChange = (e) => {
    setImagePreview(e.target.value);
  };

  const columns = [
    {
      title: "Sách",
      key: "book",
      width: 300,
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <Image
            src={record.imageUrl}
            alt={record.title}
            width={50}
            height={70}
            className="object-cover rounded"
            fallback="https://via.placeholder.com/50x70?text=No+Image"
          />
          <div>
            <div className="font-medium text-secondary-800 line-clamp-1">
              {record.title}
            </div>
            <div className="text-sm text-secondary-500">{record.author}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Danh mục",
      dataIndex: "category",
      key: "category",
      width: 120,
      render: (cat) => {
        const category = categories.find(
          (c) => c.slug === cat || c._id === cat || c.id === cat
        );
        return <Tag color="blue">{category?.name || cat}</Tag>;
      },
    },
    {
      title: "Giá",
      dataIndex: "price",
      key: "price",
      width: 120,
      sorter: (a, b) => a.price - b.price,
      render: (price) => (
        <span className="font-semibold text-primary-600">
          {formatVND(price)}
        </span>
      ),
    },
    {
      title: "Kho",
      dataIndex: "stock",
      key: "stock",
      width: 80,
      sorter: (a, b) => a.stock - b.stock,
      render: (stock) => (
        <Tag color={stock < 10 ? "red" : stock < 30 ? "orange" : "green"}>
          {stock}
        </Tag>
      ),
    },
    {
      title: "Đã bán",
      dataIndex: "sold",
      key: "sold",
      width: 80,
      sorter: (a, b) => (a.sold || 0) - (b.sold || 0),
      render: (sold) => sold || 0,
    },
    {
      title: "Đánh giá",
      dataIndex: "rating",
      key: "rating",
      width: 80,
      render: (rating) => (
        <div className="flex items-center gap-1">
          <span className="text-amber-500">★</span>
          <span>{rating || 0}</span>
        </div>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
            className="text-blue-500 hover:text-blue-600"
          />
          <Popconfirm
            title="Xóa sách này?"
            description="Hành động này không thể hoàn tác."
            onConfirm={() => handleDelete(record._id || record.id)}
            okText="Xóa"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              className="text-red-500 hover:text-red-600"
            />
          </Popconfirm>
        </Space>
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
      {/* Warning if no categories */}
      {categories.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <svg
            className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="font-semibold text-amber-800">Chưa có danh mục nào</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Vui lòng{" "}
              <a href="/admin/categories" className="underline font-medium">
                thêm danh mục
              </a>{" "}
              trước khi thêm sách.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1">
            Quản lý sách
          </Title>
          <Text type="secondary">{books.length} sách trong danh mục</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => openModal()}
          disabled={categories.length === 0}
          title={categories.length === 0 ? "Vui lòng thêm danh mục trước" : ""}
        >
          Thêm sách mới
        </Button>
      </div>

      <Card bordered={false} className="shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Tìm theo tên sách hoặc tác giả..."
            prefix={<SearchOutlined className="text-gray-400" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            className="sm:max-w-xs"
          />
          <Select
            placeholder="Tất cả danh mục"
            value={categoryFilter || undefined}
            onChange={(value) => setCategoryFilter(value || "")}
            allowClear
            className="sm:w-48"
            options={[
              { value: "", label: "Tất cả danh mục" },
              ...categories.map((cat) => ({
                value: cat.slug || cat._id,
                label: cat.name,
              })),
            ]}
          />
        </div>
      </Card>

      <Card bordered={false} className="shadow-sm">
        <Table
          columns={columns}
          dataSource={filteredBooks}
          rowKey={(r) => r._id || r.id}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} của ${total} sách`,
          }}
        />
      </Card>

      <Modal
        title={
          <div className="flex items-center gap-2">
            <BookOutlined className="text-primary-500" />
            <span>{editingBook ? "Sửa sách" : "Thêm sách mới"}</span>
          </div>
        }
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setImagePreview("");
        }}
        okText={editingBook ? "Lưu thay đổi" : "Thêm sách"}
        cancelText="Hủy"
        confirmLoading={submitting}
        width={600}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="title"
            label="Tên sách"
            rules={[{ required: true, message: "Vui lòng nhập tên sách" }]}
          >
            <Input placeholder="Nhập tên sách" />
          </Form.Item>

          <Form.Item
            name="author"
            label="Tác giả"
            rules={[{ required: true, message: "Vui lòng nhập tên tác giả" }]}
          >
            <Input placeholder="Nhập tên tác giả" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="category"
              label="Danh mục"
              rules={[{ required: true, message: "Vui lòng chọn danh mục" }]}
            >
              <Select
                placeholder="Chọn danh mục"
                options={categories.map((cat) => ({
                  value: cat.slug || cat._id,
                  label: cat.name,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="price"
              label="Giá (VNĐ)"
              rules={[{ required: true, message: "Vui lòng nhập giá" }]}
            >
              <InputNumber
                min={0}
                step={1000}
                formatter={(value) =>
                  `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                }
                parser={(value) => value.replace(/\$\s?|(,*)/g, "")}
                placeholder="0"
                className="w-full"
              />
            </Form.Item>
          </div>

          <Form.Item
            name="stock"
            label="Số lượng tồn kho"
            rules={[{ required: true, message: "Vui lòng nhập số lượng" }]}
          >
            <InputNumber min={0} placeholder="0" className="w-full" />
          </Form.Item>

          <Form.Item
            name="imageUrl"
            label="URL hình ảnh"
            rules={[{ required: true, message: "Vui lòng nhập URL hình ảnh" }]}
          >
            <Input
              placeholder="https://example.com/book-cover.jpg"
              onChange={handleImageChange}
            />
          </Form.Item>

          {imagePreview && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <Text type="secondary" className="text-xs mb-2 block">
                Xem trước:
              </Text>
              <img
                src={imagePreview}
                alt="Preview"
                className="w-24 h-32 object-cover rounded shadow-sm"
                onError={(e) => {
                  e.target.src =
                    "https://via.placeholder.com/96x128?text=Invalid+URL";
                }}
              />
            </div>
          )}

          <Form.Item
            name="description"
            label="Mô tả"
            rules={[{ required: true, message: "Vui lòng nhập mô tả" }]}
          >
            <TextArea rows={4} placeholder="Nhập mô tả sách" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
