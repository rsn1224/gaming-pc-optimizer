/// OS コマンド実行の薄い抽象層。
///
/// - 本番コード: `SystemRunner` (std::process::Command をラップ)
/// - テストコード: `MockRunner` (固定レスポンスを返す)
///
/// Tauri コマンド関数はブロッキング可能な内部関数に委譲し、
/// その内部関数が `&impl CommandRunner` を受け取る設計にする。
pub type CmdOutput = (i32, String, String); // (exit_code, stdout, stderr)

pub trait CommandRunner: Send + Sync {
    fn run(&self, program: &str, args: &[&str]) -> Result<CmdOutput, String>;
}

// ── 本番実装 ───────────────────────────────────────────────────────────────────

pub struct SystemRunner;

impl CommandRunner for SystemRunner {
    fn run(&self, program: &str, args: &[&str]) -> Result<CmdOutput, String> {
        #[allow(unused_mut)]
        let mut cmd = std::process::Command::new(program);
        cmd.args(args);

        // Windows: コンソールウィンドウを表示しない (CREATE_NO_WINDOW = 0x08000000)
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let out = cmd.output().map_err(|e| e.to_string())?;
        Ok((
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stdout).into_owned(),
            String::from_utf8_lossy(&out.stderr).into_owned(),
        ))
    }
}

// ── テスト用モック実装 ─────────────────────────────────────────────────────────

#[cfg(test)]
pub struct MockRunner {
    responses: std::sync::Mutex<std::collections::VecDeque<Result<CmdOutput, String>>>,
}

#[cfg(test)]
impl MockRunner {
    pub fn new(responses: Vec<Result<CmdOutput, String>>) -> Self {
        Self {
            responses: std::sync::Mutex::new(responses.into()),
        }
    }

    /// Shorthand: queue a successful response with the given stdout.
    pub fn success(stdout: &str) -> Self {
        Self::new(vec![Ok((0, stdout.to_string(), String::new()))])
    }

    /// Shorthand: queue a failing response with the given stderr.
    pub fn failure(stderr: &str) -> Self {
        Self::new(vec![Ok((1, String::new(), stderr.to_string()))])
    }
}

#[cfg(test)]
impl CommandRunner for MockRunner {
    fn run(&self, _program: &str, _args: &[&str]) -> Result<CmdOutput, String> {
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Err("MockRunner: no more responses queued".to_string()))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_runner_returns_queued_success() {
        let runner = MockRunner::success("hello\n");
        let (code, stdout, stderr) = runner.run("any", &[]).unwrap();
        assert_eq!(code, 0);
        assert_eq!(stdout, "hello\n");
        assert!(stderr.is_empty());
    }

    #[test]
    fn mock_runner_returns_queued_failure() {
        let runner = MockRunner::failure("access denied");
        let (code, _stdout, stderr) = runner.run("any", &[]).unwrap();
        assert_eq!(code, 1);
        assert_eq!(stderr, "access denied");
    }

    #[test]
    fn mock_runner_returns_multiple_responses_in_order() {
        let runner = MockRunner::new(vec![
            Ok((0, "first".to_string(), String::new())),
            Ok((0, "second".to_string(), String::new())),
        ]);
        let (_, s1, _) = runner.run("cmd", &[]).unwrap();
        let (_, s2, _) = runner.run("cmd", &[]).unwrap();
        assert_eq!(s1, "first");
        assert_eq!(s2, "second");
    }
}
