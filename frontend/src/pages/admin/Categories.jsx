import { useState, useEffect, useMemo } from "react";
import {
  Table,
  Button,
  Input,
  Modal,
  Form,
  Popconfirm,
  message,
  Tag,
  Empty,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { categoriesAPI } from "../../services/api.js";

// Generate slug from name
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Fetch categories from API
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await categoriesAPI.getAll();
      console.log("Categories API response:", res);
      if (res.success) {
        setCategories(res.data.categories || []);
      } else {
        message.error("Không thể tải danh mục");
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      message.error("Lỗi khi tải danh mục");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Filter categories
  const filteredCategories = useMemo(() => {
    if (!searchText) return categories;
    const search = searchText.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(search) ||
        cat.slug.toLowerCase().includes(search)
    );
  }, [categories, searchText]);

  // Open modal for add/edit
  const openModal = (category = null) => {
    setEditingCategory(category);
    if (category) {
      form.setFieldsValue({
        name: category.name,
        slug: category.slug,
        description: category.description,
        image: category.image,
      });
    } else {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  // Handle name change to auto-generate slug
  const handleNameChange = (e) => {
    const name = e.target.value;
    if (!editingCategory) {
      form.setFieldsValue({ slug: generateSlug(name) });
    }
  };

  // Handle form submit - SAVE TO DATABASE
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingCategory) {
        // Update existing category
        const res = await categoriesAPI.update(
          editingCategory._id || editingCategory.id,
          values
        );
        if (res.success) {
          message.success("Cập nhật danh mục thành công");
          fetchCategories(); // Reload from DB
        } else {
          message.error(res.message || "Lỗi cập nhật danh mục");
        }
      } else {
        // Create new category
        const res = await categoriesAPI.create(values);
        if (res.success) {
          message.success("Thêm danh mục thành công");
          fetchCategories(); // Reload from DB
        } else {
          message.error(res.message || "Lỗi thêm danh mục");
        }
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingCategory(null);
    } catch (error) {
      console.error("Submit error:", error);
      message.error(error.message || "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      const res = await categoriesAPI.delete(id);
      if (res.success) {
        message.success("Xóa danh mục thành công");
        fetchCategories(); // Reload from DB
      } else {
        message.error(res.message || "Lỗi xóa danh mục");
      }
    } catch (error) {
      console.error("Delete error:", error);
      message.error("Có lỗi xảy ra");
    }
  };

  // Table columns
  const columns = [
    {
      title: "Tên danh mục",
      dataIndex: "name",
      key: "name",
      render: (text) => (
        <span className="font-medium text-secondary-800">{text}</span>
      ),
    },
    {
      title: "Slug",
      dataIndex: "slug",
      key: "slug",
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (text) => (
        <span className="text-secondary-500">{text || "-"}</span>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
      render: (text) =>
        text ? new Date(text).toLocaleDateString("vi-VN") : "-",
    },
    {
      title: "Hành động",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
            className="text-primary-600 hover:text-primary-700 hover:bg-primary-50"
          />
          <Popconfirm
            title="Xóa danh mục"
            description="Bạn có chắc muốn xóa danh mục này?"
            onConfirm={() => handleDelete(record._id || record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            />
          </Popconfirm>
        </div>
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
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-800">
            Quản lý danh mục
          </h1>
          <p className="text-secondary-500 mt-1">
            {categories.length} danh mục
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<ReloadOutlined />} onClick={fetchCategories}>
            Tải lại
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openModal()}
            className="bg-primary-500 hover:bg-primary-600"
          >
            Thêm danh mục
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Tìm kiếm theo tên hoặc slug..."
          prefix={<SearchOutlined className="text-secondary-400" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="max-w-md"
          allowClear
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table
          columns={columns}
          dataSource={filteredCategories}
          rowKey={(r) => r._id || r.id}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `Tổng ${total} danh mục`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  searchText
                    ? "Không tìm thấy danh mục"
                    : "Chưa có danh mục nào"
                }
              />
            ),
          }}
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        title={editingCategory ? "Sửa danh mục" : "Thêm danh mục mới"}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setEditingCategory(null);
        }}
        okText={editingCategory ? "Cập nhật" : "Thêm"}
        cancelText="Hủy"
        confirmLoading={submitting}
        okButtonProps={{ className: "bg-primary-500 hover:bg-primary-600" }}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[{ required: true, message: "Vui lòng nhập tên danh mục" }]}
          >
            <Input
              placeholder="Ví dụ: Văn học, Khoa học..."
              onChange={handleNameChange}
            />
          </Form.Item>

          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true, message: "Vui lòng nhập slug" },
              {
                pattern: /^[a-z0-9-]+$/,
                message: "Slug chỉ chứa chữ thường, số và dấu gạch ngang",
              },
            ]}
            tooltip="Dùng trong URL và lọc sản phẩm"
          >
            <Input placeholder="vd: van-hoc, khoa-hoc..." />
          </Form.Item>

          <Form.Item name="image" label="URL hình ảnh">
            <Input placeholder="https://example.com/image.jpg" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả ngắn về danh mục..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
