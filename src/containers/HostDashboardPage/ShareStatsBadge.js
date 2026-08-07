import React, { useEffect, useState } from 'react';

import { getShareLinkStats } from '../../util/api';

// c153: shows the host their tracked-link click counts — proof that posting the
// link off-platform is working. Renders a teaser line until the first click.
const ShareStatsBadge = ({ listingId }) => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!listingId) return;
    getShareLinkStats(listingId)
      .then(setStats)
      .catch(() => setStats(null));
  }, [listingId]);
  if (!listingId || !stats) return null;
  const { last7 = 0, total = 0 } = stats;
  return (
    <p style={{ marginTop: 12, fontWeight: 600 }}>
      {total > 0
        ? `🔥 ${last7} link click${last7 === 1 ? '' : 's'} this week · ${total} all-time`
        : 'Your link is trackable — clicks will show up right here once you post it.'}
    </p>
  );
};

export default ShareStatsBadge;
