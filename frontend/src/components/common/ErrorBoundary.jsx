import { Component } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

import { ErrorIllustration } from "@/components/common/illustrations";
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
            <ErrorIllustration className="mx-auto mb-6 h-32 w-40 text-danger-strong" />
            <h1 className="text-h1 font-display font-bold text-foreground">
              Rất tiếc, đã có lỗi xảy ra
            </h1>
            <p className="text-muted-foreground mt-2">
              Vui lòng tải lại trang hoặc thử lại sau ít phút.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button onClick={this.handleReset}>
                <RefreshCw className="size-4" />
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
