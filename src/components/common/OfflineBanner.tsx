import { FiWifiOff } from 'react-icons/fi';
import { useOnlineStatus } from '../../hooks/useBusData';

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="banner banner--warn banner--sticky" role="status">
      <FiWifiOff aria-hidden="true" />
      <span>أنت غير متصل بالإنترنت. لا يمكن حفظ التغييرات إلا عند الاتصال.</span>
    </div>
  );
}
