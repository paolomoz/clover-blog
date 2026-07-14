/**
 * hero — full-bleed photo banner (captured archive/library photograph).
 *
 * Authoring: a single image in the block. Variant `cover` crops to a
 * responsive banner height (donor library banner).
 */
export default function decorate(block) {
  const picture = block.querySelector('picture');
  block.textContent = '';
  if (!picture) return;
  const img = picture.querySelector('img');
  if (img) {
    img.loading = 'eager';
    img.fetchPriority = 'high';
  }
  block.append(picture);
}
