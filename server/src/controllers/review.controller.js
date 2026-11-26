const createReviewController = (reviewService) => ({
  create: async (req, res) => {
    const data = await reviewService.requestReview(req.user._id, req.body || {});
    return res.status(data.reused ? 200 : 202).json({ success: true, data: { review: data.review, reused: data.reused } });
  },
  list: async (req, res) => res.status(200).json({ success: true, data: await reviewService.listReviews(req.user._id, {
    page: req.query.page === undefined ? 1 : Number(req.query.page),
    perPage: req.query.per_page === undefined ? 20 : Number(req.query.per_page),
    status: req.query.status,
    repositoryId: req.query.repository_id,
    pullNumber: req.query.pull_number,
  }) }),
  get: async (req, res) => res.status(200).json({ success: true, data: { review: await reviewService.getOwned(req.user._id, req.params.reviewId) } }),
  retry: async (req, res) => {
    const result = await reviewService.retry(req.user._id, req.params.reviewId);
    return res.status(result.reused ? 200 : 202).json({ success: true, data: result });
  },
  cancel: async (req, res) => res.status(200).json({ success: true, data: await reviewService.cancel(req.user._id, req.params.reviewId) }),
});

module.exports = createReviewController;
