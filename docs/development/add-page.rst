Adding a Route
==============

1. Create a new template file in `src/fava/templates`
    + Either a full template or a partial
1. Add new `@app.route()` declaration in `src/fava/application.py`
    + Also add entry to `REPORTS` in the same file
1. Modify `src/fava/templates/_globals.html:
    + Add entry to `all_pages` 
    + Add entry to `navigation_bar` 
1. UI Router ???