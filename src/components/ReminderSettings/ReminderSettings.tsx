import { FiBell, FiBellOff } from 'react-icons/fi';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import type { PushOwner } from '../../services/pushService';
import { ErrorBanner } from '../common/ErrorBanner';

const SCHEDULE = '7:00 الصبح للذهاب و4:00 العصر للعودة (من الأحد للخميس)';

/** "فعّل التنبيهات" card on the employee screen: the daily IN / OUT reminders on this device. */
export function ReminderSettings({ owner }: { owner: PushOwner }) {
  const push = usePushNotifications(owner);

  // Not configured for this build, or still checking: show nothing rather than a flicker.
  if (push.state === null || push.state === 'not-configured') return null;

  let text: string;
  switch (push.state) {
    case 'on':
      text = `التنبيهات مفعّلة على الجهاز ده: هنفكّرك ${SCHEDULE}. هتفضل شغالة حتى لو قفلت التطبيق أو عملت تغيير الموظف، لحد ما توقفها من هنا.`;
      break;
    case 'other-user':
      text = `التنبيهات على الجهاز ده مفعّلة لموظف تاني. اضغط «فعّل التنبيهات» علشان توصلك إنت بدله: ${SCHEDULE}.`;
      break;
    case 'off':
      text = `فعّل التنبيهات علشان نفكّرك تحدد IN أو OUT كل يوم: ${SCHEDULE}.`;
      break;
    case 'denied':
      text = 'التنبيهات مقفولة لهذا الموقع. افتح إعدادات المتصفح ← إعدادات الموقع ← الإشعارات، واسمح بها، ثم ارجع هنا.';
      break;
    case 'needs-install':
      text =
        'على الآيفون التنبيهات بتشتغل بس لو التطبيق متضاف للشاشة الرئيسية: اضغط زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من الأيقونة وفعّل التنبيهات من هناك.';
      break;
    default:
      text = 'المتصفح ده مش بيدعم التنبيهات. افتح التطبيق من Chrome أو Safari حديث.';
  }

  return (
    <section className="section reminders" aria-labelledby="reminders-title">
      <div className="section__head">
        <h2 id="reminders-title">التنبيهات اليومية</h2>
      </div>

      <ErrorBanner message={push.error} onDismiss={push.clearError} />
      <p className="tracker__status">{text}</p>

      {(push.state === 'off' || push.state === 'other-user' || push.state === 'on') && (
        <div className="tracker__actions">
          {push.state !== 'on' ? (
            <button type="button" className="btn btn--primary" disabled={push.busy} onClick={() => void push.enable()}>
              {push.busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiBell aria-hidden="true" />}
              فعّل التنبيهات
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" disabled={push.busy} onClick={() => void push.disable()}>
              {push.busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiBellOff aria-hidden="true" />}
              إيقاف التنبيهات
            </button>
          )}
        </div>
      )}
    </section>
  );
}
