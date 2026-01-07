// Mock Users
export const mockUsers = [
  {
    id: "admin1",
    name: "Admin",
    email: "admin@bookshop.com",
    password: "admin123",
    role: "admin",
  },
  {
    id: "user1",
    name: "John Doe",
    email: "user@bookshop.com",
    password: "user123",
    role: "user",
  },
];

// Categories
export const categories = [
  {
    id: "fiction",
    name: "Fiction",
    image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400",
  },
  {
    id: "non-fiction",
    name: "Non-Fiction",
    image: "https://images.unsplash.com/photo-1589998059171-988d887df646?w=400",
  },
  {
    id: "science",
    name: "Science & Tech",
    image: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400",
  },
  {
    id: "children",
    name: "Children's Books",
    image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400",
  },
  {
    id: "self-help",
    name: "Self-Help",
    image: "https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?w=400",
  },
  {
    id: "biography",
    name: "Biography",
    image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400",
  },
];

// Mock Books
export const mockBooks = [
  {
    id: "book1",
    title: "The Midnight Library",
    author: "Matt Haig",
    description:
      "Between life and death there is a library, and within that library, the shelves go on forever. Every book provides a chance to try another life you could have lived.",
    price: 24.99,
    imageUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400",
    category: "fiction",
    stock: 50,
    soldCount: 342,
    rating: 4.5,
    reviewCount: 128,
    createdAt: "2024-01-15",
  },
  {
    id: "book2",
    title: "Atomic Habits",
    author: "James Clear",
    description:
      "An easy and proven way to build good habits and break bad ones. Transform your life with tiny changes in behavior.",
    price: 19.99,
    imageUrl:
      "https://images.unsplash.com/photo-1589998059171-988d887df646?w=400",
    category: "self-help",
    stock: 100,
    soldCount: 521,
    rating: 4.8,
    reviewCount: 256,
    createdAt: "2024-02-20",
  },
  {
    id: "book3",
    title: "A Brief History of Time",
    author: "Stephen Hawking",
    description:
      "A landmark volume in science writing, exploring the nature of time, the Big Bang, black holes, and the future of the universe.",
    price: 29.99,
    imageUrl:
      "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400",
    category: "science",
    stock: 35,
    soldCount: 189,
    rating: 4.7,
    reviewCount: 87,
    createdAt: "2023-11-10",
  },
  {
    id: "book4",
    title: "The Very Hungry Caterpillar",
    author: "Eric Carle",
    description:
      "A classic children's book about a caterpillar's journey through eating and transformation into a butterfly.",
    price: 12.99,
    imageUrl:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400",
    category: "children",
    stock: 200,
    soldCount: 678,
    rating: 4.9,
    reviewCount: 312,
    createdAt: "2024-03-01",
  },
  {
    id: "book5",
    title: "Steve Jobs",
    author: "Walter Isaacson",
    description:
      "The exclusive biography of Steve Jobs, based on more than forty interviews with Jobs and interviews with family, friends, and colleagues.",
    price: 34.99,
    imageUrl:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400",
    category: "biography",
    stock: 45,
    soldCount: 234,
    rating: 4.6,
    reviewCount: 156,
    createdAt: "2023-12-05",
  },
  {
    id: "book6",
    title: "Sapiens: A Brief History",
    author: "Yuval Noah Harari",
    description:
      "A groundbreaking narrative of humanity's creation and evolution, exploring the cognitive, agricultural, and scientific revolutions.",
    price: 27.99,
    imageUrl:
      "https://images.unsplash.com/photo-1589998059171-988d887df646?w=400",
    category: "non-fiction",
    stock: 60,
    soldCount: 445,
    rating: 4.7,
    reviewCount: 198,
    createdAt: "2024-01-20",
  },
  {
    id: "book7",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    description:
      "A portrait of the Jazz Age in all of its decadence and excess, telling the story of the mysterious Jay Gatsby.",
    price: 14.99,
    imageUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400",
    category: "fiction",
    stock: 80,
    soldCount: 567,
    rating: 4.4,
    reviewCount: 234,
    createdAt: "2024-02-10",
  },
  {
    id: "book8",
    title: "Clean Code",
    author: "Robert C. Martin",
    description:
      "A handbook of agile software craftsmanship. Learn to write clean, maintainable code that works.",
    price: 44.99,
    imageUrl:
      "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400",
    category: "science",
    stock: 40,
    soldCount: 312,
    rating: 4.6,
    reviewCount: 178,
    createdAt: "2024-03-15",
  },
  {
    id: "book9",
    title: "The Power of Now",
    author: "Eckhart Tolle",
    description:
      "A guide to spiritual enlightenment, teaching you to live in the present moment and find inner peace.",
    price: 18.99,
    imageUrl:
      "https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?w=400",
    category: "self-help",
    stock: 75,
    soldCount: 389,
    rating: 4.5,
    reviewCount: 167,
    createdAt: "2024-01-25",
  },
  {
    id: "book10",
    title: "Harry Potter and the Sorcerer's Stone",
    author: "J.K. Rowling",
    description:
      "The beloved first book in the Harry Potter series, where a young wizard discovers his magical heritage.",
    price: 22.99,
    imageUrl:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400",
    category: "children",
    stock: 150,
    soldCount: 892,
    rating: 4.9,
    reviewCount: 456,
    createdAt: "2024-02-28",
  },
];

// Mock Orders
export let mockOrders = [
  {
    id: "order1",
    userId: "user1",
    items: [
      {
        bookId: "book1",
        title: "The Midnight Library",
        price: 24.99,
        quantity: 1,
      },
      { bookId: "book2", title: "Atomic Habits", price: 19.99, quantity: 2 },
    ],
    total: 64.97,
    totalAmount: 64.97,
    status: "completed",
    shippingAddress: {
      fullName: "John Doe",
      phone: "0123456789",
      address: "123 Main St, City, Country",
    },
    paymentMethod: "cod",
    createdAt: "2024-12-25",
  },
];

// Mock Reviews
export let mockReviews = [
  {
    id: "review1",
    bookId: "book1",
    userId: "user1",
    userName: "John Doe",
    orderId: "order1",
    rating: 5,
    comment:
      "Absolutely loved this book! A beautiful story about second chances and the paths not taken.",
    createdAt: "2024-12-26",
  },
];

// Helper functions
export const getBestSellers = () => {
  return [...mockBooks].sort((a, b) => b.soldCount - a.soldCount).slice(0, 8);
};

export const getNewBooks = () => {
  return [...mockBooks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);
};

export const getBooksByCategory = (categoryId) => {
  return mockBooks.filter((book) => book.category === categoryId);
};

export const getBookById = (id) => {
  return mockBooks.find((book) => book.id === id);
};

export const getReviewsByBookId = (bookId) => {
  return mockReviews.filter((review) => review.bookId === bookId);
};

export const getUserOrders = (userId) => {
  return mockOrders.filter((order) => order.userId === userId);
};

// Alias for getUserOrders
export const getOrdersByUserId = getUserOrders;

export const getOrderById = (orderId) => {
  return mockOrders.find((order) => order.id === orderId);
};

export const canUserReview = (userId, bookId) => {
  const hasOrdered = mockOrders.some(
    (order) =>
      order.userId === userId &&
      order.status === "completed" &&
      order.items.some((item) => item.bookId === bookId)
  );
  const hasReviewed = mockReviews.some(
    (review) => review.userId === userId && review.bookId === bookId
  );
  return hasOrdered && !hasReviewed;
};

export const addReview = (review) => {
  const newReview = {
    ...review,
    id: `review_${Date.now()}`,
    createdAt: new Date().toISOString().split("T")[0],
  };
  mockReviews.push(newReview);

  // Update book rating
  const book = mockBooks.find((b) => b.id === review.bookId);
  if (book) {
    const bookReviews = getReviewsByBookId(review.bookId);
    const avgRating =
      bookReviews.reduce((sum, r) => sum + r.rating, 0) / bookReviews.length;
    book.rating = Math.round(avgRating * 10) / 10;
    book.reviewCount = bookReviews.length;
  }

  return newReview;
};

export const createOrder = (userId, items, shippingAddress) => {
  const totalAmount = items.reduce(
    (sum, item) => sum + item.book.price * item.quantity,
    0
  );
  const order = {
    id: `order_${Date.now()}`,
    userId,
    items: items.map((item) => ({
      bookId: item.book.id,
      title: item.book.title,
      price: item.book.price,
      quantity: item.quantity,
    })),
    total: totalAmount,
    totalAmount: totalAmount,
    status: "pending",
    shippingAddress,
    paymentMethod: "cod",
    createdAt: new Date().toISOString().split("T")[0],
  };

  // Update sold counts
  items.forEach((item) => {
    const book = mockBooks.find((b) => b.id === item.book.id);
    if (book) {
      book.soldCount += item.quantity;
      book.stock -= item.quantity;
    }
  });

  mockOrders.push(order);
  return order;
};

export const updateOrderStatus = (orderId, status) => {
  const order = mockOrders.find((o) => o.id === orderId);
  if (order) {
    order.status = status;
  }
  return order;
};
