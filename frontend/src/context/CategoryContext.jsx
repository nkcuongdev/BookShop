import { createContext, useContext, useState, useEffect } from "react";
import { categoriesAPI } from "../services/api.js";

const CategoryContext = createContext(null);

// Generate slug from name
export const generateSlug = (name) => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch categories from backend API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await categoriesAPI.getAll();
        if (response.success && response.data?.categories) {
          // Normalize categories to have consistent id field
          const normalizedCategories = response.data.categories.map((cat) => ({
            ...cat,
            id: cat._id || cat.id,
          }));
          setCategories(normalizedCategories);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  // Refresh categories from backend
  const refreshCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      if (response.success && response.data?.categories) {
        const normalizedCategories = response.data.categories.map((cat) => ({
          ...cat,
          id: cat._id || cat.id,
        }));
        setCategories(normalizedCategories);
      }
    } catch (error) {
      console.error("Error refreshing categories:", error);
    }
  };

  const getCategoryBySlug = (slug) => {
    return categories.find((cat) => cat.slug === slug);
  };

  const isSlugUnique = (slug, excludeId = null) => {
    return !categories.some((cat) => cat.slug === slug && cat.id !== excludeId);
  };

  return (
    <CategoryContext.Provider
      value={{
        categories,
        loading,
        refreshCategories,
        getCategoryBySlug,
        isSlugUnique,
        generateSlug,
      }}
    >
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategories must be used within a CategoryProvider");
  }
  return context;
}
