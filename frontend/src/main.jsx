import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { CategoryProvider } from "./context/CategoryContext.jsx";
import { AppProviders } from "./app/providers.jsx";
import { cleanupLegacyTheme } from "./lib/themeCleanup.js";

// Runs before first render so a returning visitor never paints with the stale
// `dark` class still on <html>.
cleanupLegacyTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <AuthProvider>
          <CategoryProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </CategoryProvider>
        </AuthProvider>
      </AppProviders>
    </BrowserRouter>
  </StrictMode>
);
