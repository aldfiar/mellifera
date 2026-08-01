# Mellifera build targets. Pure-Go: CGO is disabled everywhere so the
# result is a single static binary with no C-toolchain dependency.
# See .claude/skills/mellifera-build/SKILL.md for the build gate.

.PHONY: proto build test lint check build-plugin

# proto: regenerate gRPC bindings from the .proto definitions (requires
# protoc + protoc-gen-go/protoc-gen-go-grpc, or buf). Generated *.pb.go are
# committed; this target is only needed to regenerate.
proto:
	buf generate

# build: compile every Mellifera Go package (pure-Go, no CGO).
build:
	CGO_ENABLED=0 go build ./...

# test: run the table-driven test suite.
test:
	CGO_ENABLED=0 go test ./...

# lint: the complexity/quality budget (golangci-lint).
lint:
	golangci-lint run ./...

# check: the Mellifera build gate (lint + exported-symbol count per package).
check:
	bash .claude/skills/mellifera-build/scripts/check.sh

# build-plugin: build every plugin binary. base-scanner is wired in T08;
# tv-parser (the first metadata_source plugin) in T06.
build-plugin:
	CGO_ENABLED=0 go build -o bin/base-scanner ./plugins/base-scanner
	CGO_ENABLED=0 go build -o bin/tv-parser ./plugins/tv-parser
