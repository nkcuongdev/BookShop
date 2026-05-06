import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-5">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-display font-bold text-secondary-800">
              Rất tiếc, đã có lỗi xảy ra
            </h1>
            <p className="text-secondary-500 mt-2">
              Vui lòng tải lại trang hoặc thử lại sau ít phút.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button onClick={this.handleReset}>
                <RefreshCw className="w-4 h-4" />
                Tải lại trang
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/")}
              >
                Về trang chủ
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
