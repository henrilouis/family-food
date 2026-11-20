module github.com/henrilouis/family-food/ahdump

go 1.27.4

require github.com/gwillem/appie-go v0.0.0

// A copy of edeckers' fork at cef776a (the fix for the 6 November 2026 login change, gwillem/appie-go#34, not
// merged upstream) with one family-food patch for the 20 November 2026 login change; see third_party/appie-go/NOTICE.md.
replace github.com/gwillem/appie-go => ./third_party/appie-go
