import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const FORBIDDEN_MESSAGE = "Bạn không có quyền thực hiện thao tác này.";

/** An auth or permission failure will not resolve by asking again. */
const isTerminalAuthError = (error) =>
  error?.status === 401 || error?.status === 403;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) =>
        !isTerminalAuthError(error) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        // The API's own 403 wording is aimed at developers; show the staff a
        // consistent line instead.
        const msg =
          error?.code === "FORBIDDEN" || error?.status === 403
            ? FORBIDDEN_MESSAGE
            : error?.message || "Đã xảy ra lỗi, vui lòng thử lại sau.";
        toast.error(msg);
      },
    },
  },
});
