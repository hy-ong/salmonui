import { SearchButton } from './SearchButton';

/**
 * Top bar position of the search button and Cmd/Ctrl-K dialog. The button is a small client component; it loads the dialog on
 * first use, and the dialog fetches the index on first open.
 */
export function SearchSlot() {
  return (
    <div className="site-search" data-search-slot="">
      <SearchButton />
    </div>
  );
}
