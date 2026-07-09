import { request } from "./client";

export const uploadsAPI = {
  uploadImage: async (file, purpose = "book") => {
    const formData = new FormData();
    formData.append("image", file);
    return request(
      `/admin/uploads/images?purpose=${encodeURIComponent(purpose)}`,
      {
      method: "POST",
      body: formData,
      }
    );
  },
  uploadReviewImage: async (bookId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request(`/uploads/review-images?bookId=${encodeURIComponent(bookId)}`, {
      method: "POST",
      body: formData,
    });
  },
  uploadReturnImage: async (orderId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request(`/uploads/return-images?orderId=${encodeURIComponent(orderId)}`, {
      method: "POST",
      body: formData,
    });
  },
  uploadSupportTicketImage: async (orderId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request(`/uploads/support-ticket-images?orderId=${encodeURIComponent(orderId)}`, {
      method: "POST",
      body: formData,
    });
  },
};
