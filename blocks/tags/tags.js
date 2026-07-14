/**
 * tags — topic chips under an article (donor tag-link treatment).
 *
 * Authoring: a single cell containing the topic links (a plain list or
 * paragraph of links).
 */
export default function decorate(block) {
  const links = [...block.querySelectorAll('a')];
  const ul = document.createElement('ul');
  ul.setAttribute('aria-label', 'Topics');
  links.forEach((a) => {
    const li = document.createElement('li');
    const chip = a.cloneNode(true);
    chip.className = 'tag-link';
    li.append(chip);
    ul.append(li);
  });
  block.replaceChildren(ul);
}
