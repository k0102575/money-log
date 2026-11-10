import { data } from "react-router";
import { ConflictError, InputError } from "./domain";
export function actionFailure(error: unknown) {
  if (error instanceof Response && error.status >= 300 && error.status < 400)
    throw error;
  const status =
    error instanceof ConflictError
      ? 409
      : error instanceof InputError
        ? 400
        : error instanceof Response
          ? error.status
          : 500;
  const message =
    error instanceof InputError || error instanceof ConflictError
      ? error.message
      : status === 401
        ? "로그인이 만료되었습니다. 새 탭에서 로그인한 뒤 다시 저장해 주세요."
        : status === 403
          ? "인증 정보가 변경되었습니다. 로그인 상태를 확인한 뒤 재인증 확인을 눌러 주세요."
          : "저장하지 못했습니다. 입력을 유지했으니 잠시 후 다시 시도해 주세요.";
  return data({ error: message }, { status });
}
