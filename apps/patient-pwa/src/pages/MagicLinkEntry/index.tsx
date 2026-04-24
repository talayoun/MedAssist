import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveVisit, ApiError } from '../../services/api';

export default function MagicLinkEntry() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/error/not_found', { replace: true });
      return;
    }

    resolveVisit(token)
      .then((ctx) => {
        switch (ctx.phase) {
          case 'checklist':
            navigate(`/visit/${token}/checklist`, { replace: true });
            break;
          case 'navigation':
            navigate(`/visit/${token}/navigation`, { replace: true });
            break;
          case 'waiting':
            navigate(`/visit/${token}/waiting`, { replace: true });
            break;
          default:
            navigate('/error/not_found', { replace: true });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.status === 410) {
            navigate('/error/link_expired', { replace: true });
          } else if (err.status === 409) {
            navigate('/error/link_used', { replace: true });
          } else {
            navigate('/error/not_found', { replace: true });
          }
        } else {
          navigate('/error/server_error', { replace: true });
        }
      });
  }, [token, navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <p style={{ fontSize: '1.125rem', color: '#555' }}>טוען...</p>
    </div>
  );
}
