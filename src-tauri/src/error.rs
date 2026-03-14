/// アプリ共通エラー型
///
/// Tauri コマンドの戻り値 `Result<T, AppError>` に使う。
/// `serde::Serialize` を手実装しているので `#[tauri::command]` と互換。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/Oエラー: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSONエラー: {0}")]
    Json(#[from] serde_json::Error),

    #[error("コマンド実行エラー: {0}")]
    Command(String),

    #[error("無効な入力: {0}")]
    InvalidInput(String),

    #[error("リソースが見つかりません: {0}")]
    NotFound(String),

    #[error("{0}")]
    Other(String),
}

// Tauri requires error types to implement Serialize.
// We serialize as the human-readable message string.
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Other(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Other(s.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_variant_displays_message() {
        let e = AppError::Command("powercfg failed".to_string());
        assert_eq!(e.to_string(), "コマンド実行エラー: powercfg failed");
    }

    #[test]
    fn invalid_input_variant_displays_message() {
        let e = AppError::InvalidInput("bad guid".to_string());
        assert_eq!(e.to_string(), "無効な入力: bad guid");
    }

    #[test]
    fn not_found_variant_displays_message() {
        let e = AppError::NotFound("profile.json".to_string());
        assert_eq!(e.to_string(), "リソースが見つかりません: profile.json");
    }

    #[test]
    fn other_variant_displays_raw_message() {
        let e = AppError::Other("unexpected".to_string());
        assert_eq!(e.to_string(), "unexpected");
    }

    #[test]
    fn from_string_produces_other_variant() {
        let e: AppError = "from string".to_string().into();
        assert!(matches!(e, AppError::Other(_)));
        assert_eq!(e.to_string(), "from string");
    }

    #[test]
    fn from_str_produces_other_variant() {
        let e: AppError = "from &str".into();
        assert!(matches!(e, AppError::Other(_)));
        assert_eq!(e.to_string(), "from &str");
    }

    #[test]
    fn serialize_produces_error_message_string() {
        let e = AppError::Command("test error".to_string());
        let json = serde_json::to_string(&e).unwrap();
        assert_eq!(json, r#""コマンド実行エラー: test error""#);
    }
}
