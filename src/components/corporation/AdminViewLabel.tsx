/** Small note shown only when figures are visible because the viewer is an admin. */
export default function AdminViewLabel({ show }: { show: boolean | undefined }) {
  if (!show) return null;
  return (
    <p className="text-body-sm text-muted" data-testid="admin-view-label">
      Admin view: figures shown because this account is an admin
    </p>
  );
}
