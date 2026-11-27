import type { NavFamily, NavGroup, NavNode } from '../lib/site';
import { DocsNavCategory } from './DocsNavCategory';
import { NavLink } from './NavLink';

/** Pages and groups of one component: a lead page nests the rest of its group, a heading is plain text. */
function NodeList({ nodes }: { nodes: readonly NavNode[] }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.href ?? node.anchor ?? node.title}>
          {node.href ? <NavLink href={node.href}>{node.title}</NavLink> : <span className="docs-nav__group">{node.title}</span>}
          {node.children.length > 0 ? <NodeList nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sidebar of the `(docs)` layout:
 * one disclosure per family from `getDocsNavTree()`, listing its components
 * (a link, or a disclosure for a component with several pages) and then its
 * family-wide guides; only the current family and component are open. Then
 * the `getDocsNavGroups()` groups. Below 820px the body folds behind a
 * "Browse docs" checkbox toggle (CSS only, closed by default), so the page
 * content starts on the first screen.
 */
export function DocsNav({ families, groups }: { families: readonly NavFamily[]; groups: readonly NavGroup[] }) {
  return (
    <nav className="docs-nav" aria-label="Documentation">
      <input type="checkbox" id="docs-nav-toggle" className="docs-nav__toggle-input" />
      <label htmlFor="docs-nav-toggle" className="docs-nav__toggle">
        Browse docs
      </label>
      <div className="docs-nav__body">
        <h2>Components</h2>
        <ul className="docs-nav__categories">
          {families.map((family) => (
            <li key={family.family}>
              <DocsNavCategory
                level="family"
                id={family.family}
                title={family.title}
                prefixes={family.sections.flatMap((section) => [`/docs/${section}`, `/demos/${section}`])}
              >
                <ul>
                  {family.components.map((component) => (
                    <li key={component.href}>
                      {component.children.length === 0 ? (
                        <NavLink href={component.href}>{component.title}</NavLink>
                      ) : (
                        <DocsNavCategory level="component" id={component.href} title={component.title} prefixes={component.prefixes} pages={component.pages}>
                          <NodeList nodes={component.children} />
                        </DocsNavCategory>
                      )}
                    </li>
                  ))}
                  {family.guides ? (
                    <li>
                      <span className="docs-nav__group">{family.guides.title}</span>
                      <NodeList nodes={family.guides.children} />
                    </li>
                  ) : null}
                </ul>
              </DocsNavCategory>
            </li>
          ))}
        </ul>
        {groups.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href}>{item.title}</NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
