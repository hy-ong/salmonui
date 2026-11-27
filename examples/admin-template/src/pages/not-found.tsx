import { NotFoundResult } from '../components/not-found-result';
import { Link } from '../lib/router';

export function NotFoundPage() {
  return (
    <div className="atlas-page atlas-page--center">
      <NotFoundResult title="找不到頁面" subTitle="請確認網址，或返回首頁。" extra={<Link to="/">返回首頁</Link>} />
    </div>
  );
}
