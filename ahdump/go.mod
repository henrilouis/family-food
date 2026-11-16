module github.com/henrilouis/family-food/ahdump

go 1.27.4

require github.com/gwillem/appie-go v0.0.0

// edeckers' fork at cef776a fixes the 6 November 2026 login change (gwillem/appie-go#34), not merged upstream.
replace github.com/gwillem/appie-go => github.com/edeckers/appie-go v0.0.13-0.20261108182750-cef776a1cb00
