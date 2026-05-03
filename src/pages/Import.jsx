import { Download } from 'lucide-react';
import PlaylistImporter from '../components/PlaylistImporter';
import ServiceGate from '../components/ServiceGate.jsx';
import { useServiceStatus } from '../hooks/useServiceStatus.js';

export default function Import() {
  const { status, checkedAt, retry } = useServiceStatus();

  return (
    <div className="pb-32">
      <ServiceGate
        featureName="Import"
        icon={Download}
        status={status}
        checkedAt={checkedAt}
        retry={retry}
      >
        <PlaylistImporter />
      </ServiceGate>
    </div>
  );
}
