const addImageInput = document.getElementById('upload-dropzone__input');
const addPreview = document.getElementById('upload-dropzone__preview');

addImageInput?.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    const fileName = e.target.files[0].name;
    addPreview.innerHTML = 
        <i class="fas fa-check-circle text-success mb-3" style="font-size: 3.5rem;"></i>
        <p class="fw-bold text-success fs-5 mb-1">Đã chọn ảnh</p>
        <p class="text-muted mb-0"></p>
        <small class="text-muted">Click lại khu vực này để thay ảnh</small>
      ;
  }
});
