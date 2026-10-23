# identify-match-override

Layer 1.1 of the UI roadmap: the Identify overlay with match picking — operator search against a metadata source with plugin-ranked candidates served verbatim, a confirm step stating plainly what replaces what, and an identifier override that makes the next refresh fetch by the picked id; a wrong match becomes permanently fixable. Additive wire: GET /api/v1/admin/sources/{plugin_id}/search, PUT /api/v1/series/{id}/identify — series-only, films ride Layer 4; scoring stays in the plugin, the SPA renders served order.
