const { getSdk } = require('../api-util/sdk');

// Resume-listing gate (#149 / 5.1-lite): authenticated user with a draft is
// sent into the wizard at that draft; anyone else gets the fresh wizard.
// Also the target for abandoned-draft recovery links.
const NEW_WIZARD = '/l/draft/00000000-0000-0000-0000-000000000000/new/details';
module.exports = (req, res) => {
  const sdk = getSdk(req, res);
  sdk
    .ownListings.query({})
    .then(r => {
      const ls = (r.data && r.data.data) || [];
      const draft = ls.find(l => l.attributes.state === 'draft');
      if (draft) {
        const id = draft.id.uuid;
        const slug =
          (draft.attributes.title || 'draft')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'draft';
        return res.redirect(`/l/${slug}/${id}/draft/details`);
      }
      return res.redirect(NEW_WIZARD);
    })
    .catch(() => res.redirect(NEW_WIZARD));
};
