import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="flex flex-col items-center gap-5 max-w-sm text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85 mb-1.5">
              予期しないエラーが発生しました
            </h1>
            <p className="text-[11px] text-white/35 font-mono bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-left break-all">
              {this.state.error.message}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-orange-500/10 border border-orange-500/25 text-orange-400 hover:bg-orange-500/20 transition-colors"
          >
            <RotateCcw size={13} />
            アプリを再起動
          </button>
        </div>
      </div>
    );
  }
}
