import { FirebaseError } from 'firebase/app';

export type AppErrorCode =
  | 'invalid-credentials'
  | 'invalid-input'
  | 'no-access'
  | 'bus-full'
  | 'already-arrived'
  | 'already-sharing'
  | 'not-found'
  | 'too-many-requests'
  | 'permission-denied'
  | 'network'
  | 'pdf'
  | 'unknown';

/** An error whose message is safe to show to end users. */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

const MESSAGES: Record<AppErrorCode, string> = {
  'invalid-credentials': 'رقم الموظف غير موجود. تأكد من الرقم وحاول مرة أخرى.',
  'invalid-input': 'تأكد من البيانات المدخلة وحاول مرة أخرى.',
  'no-access': 'هذا الحساب غير مفعّل لاستخدام التطبيق. تواصل مع المسؤول.',
  'bus-full': 'الأتوبيس ممتلئ حالياً.',
  'already-arrived': 'تم تسجيل الوصول لهذه الرحلة بالفعل.',
  'already-sharing': 'زميل آخر يشارك موقع الأتوبيس بالفعل.',
  'not-found': 'لم نعثر على هذا السجل.',
  'too-many-requests': 'محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.',
  'permission-denied': 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  network: 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.',
  pdf: 'تعذر إنشاء ملف PDF. حاول مرة أخرى.',
  unknown: 'حدث خطأ ما. حاول مرة أخرى.',
};

export const makeError = (code: AppErrorCode, message?: string) =>
  new AppError(code, message ?? MESSAGES[code]);

/** Converts anything thrown (Firebase, network, our own) into a user-safe AppError. */
export function toAppError(err: unknown, fallback: AppErrorCode = 'unknown'): AppError {
  if (err instanceof AppError) return err;

  // Keep the raw error for developers only.
  console.error(err);

  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/invalid-email':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/user-disabled':
        return makeError('invalid-credentials');
      case 'auth/too-many-requests':
        return makeError('too-many-requests');
      case 'auth/network-request-failed':
      case 'unavailable':
      case 'deadline-exceeded':
        return makeError('network');
      case 'permission-denied':
        return makeError('permission-denied');
      case 'not-found':
        return makeError('not-found');
      default:
        return makeError(fallback);
    }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return makeError('network');
  return makeError(fallback);
}
