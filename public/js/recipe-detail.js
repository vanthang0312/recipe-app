(function(){
  const page = document.getElementById('recipe-page');
  if (!page) return;
  const recipeId = page.dataset.recipeId;
  const isAdmin = page.dataset.isAdmin === 'true';
  let currentRating = 0;

  async function loadComments() {
    try {
      const res = await fetch(`/recipes/${recipeId}/rating-comments`);
      if (!res.ok) throw new Error('Lỗi server');
      const data = await res.json();

      const avg = data.avgRating ? Number(data.avgRating).toFixed(1) : 0;
      const total = data.totalRatings || 0;
      const ratingText = document.getElementById('rating-text');
      ratingText?.classList.remove('rating-highlight');

      if (ratingText) {
        if (total > 0) {
          const highlightBadge = avg >= 4 ? '<span class="badge bg-success ms-2">Nổi bật</span>' : '';
          ratingText.innerHTML = `
            <strong class="fs-4 text-warning">${avg}/5</strong>
            ${highlightBadge}
            <br><small class="text-muted">(${total} đánh giá)</small>`;
          if (avg >= 4) ratingText.classList.add('rating-highlight');
        } else {
          ratingText.innerHTML = '<span class="text-muted">Chưa có đánh giá nào</span>';
        }
      }

      currentRating = data.userRating || 0;
      document.querySelectorAll('.star').forEach((s, i) => {
        s.classList.toggle('text-warning', i < currentRating);
      });

      const list = document.getElementById('comments-list');
      if (!list) return;
      if (!data.comments || data.comments.length === 0) {
        list.innerHTML = `
          <div class="text-center py-5 bg-light rounded-4">
            <i class="fas fa-comment-slash fa-3x text-muted mb-3"></i>
            <p class="text-muted">Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!</p>
          </div>`;
      } else {
        list.innerHTML = data.comments
          .map(
            (c) => `
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-body p-4">
              <div class="d-flex gap-3">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(
                  c.user_name || 'User'
                )}&background=d32f2f&color=fff&bold=true&rounded=true" 
                     class="rounded-circle flex-shrink-0" width="50" height="50">
                <div class="flex-grow-1">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="text-danger">${c.user_name || 'Ẩn danh'}</strong>
                    <small class="text-muted">${new Date(c.created_at).toLocaleString('vi-VN')}</small>
                  </div>
                  <p class="mb-0 text-dark">${(c.content || '').replace(/\n/g, '<br>')}</p>
                  ${isAdmin ? `
                  <div class="text-end mt-3">
                    <form method="POST" action="/admin/comments/${c.id}/delete" onsubmit="return confirm('Xóa bình luận này?');">
                      <button type="submit" class="btn btn-sm btn-danger rounded-pill px-3">
                        <i class="fas fa-trash me-1"></i>Xóa
                      </button>
                    </form>
                  </div>` : ''}
                </div>
              </div>
            </div>
          </div>
        `
          )
          .join('');
      }
    } catch (err) {
      console.error('Lỗi load bình luận:', err);
      const list = document.getElementById('comments-list');
      if (list) list.innerHTML = '<p class="text-danger text-center">Không thể tải bình luận</p>';
    }
  }

  document.querySelectorAll('.star').forEach((star) => {
    star.style.cursor = 'pointer';
    star.addEventListener('click', () => {
      currentRating = parseInt(star.dataset.rating, 10);
      document.querySelectorAll('.star').forEach((s, i) => {
        s.classList.toggle('text-warning', i < currentRating);
      });
    });
  });

  document.getElementById('rating-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentRating === 0) return alert('Vui lòng chọn số sao!');
    const res = await fetch(`/recipes/${recipeId}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: currentRating }),
    });
    if (res.ok) {
      loadComments();
      alert('Cảm ơn bạn đã đánh giá!');
    }
  });

  document.getElementById('comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = e.target.content.value.trim();
    if (content.length < 5) return alert('Bình luận ít nhất 5 ký tự!');
    const res = await fetch(`/recipes/${recipeId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      e.target.reset();
      loadComments();
      alert('Bình luận thành công!');
    }
  });

  loadComments();
})();
