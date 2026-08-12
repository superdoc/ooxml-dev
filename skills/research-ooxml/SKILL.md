---
name: research-ooxml
description: Research published OOXML specification text, schema structure, namespaces, package parts, and preset shapes through the ooxml CLI. Use when an agent needs evidence about valid OOXML markup, element children or attributes, simple-type values, specification sections, or OPC package metadata while implementing or reviewing document tooling.
---

# Research OOXML

Use the `ooxml` CLI. Treat its output as reference evidence, not permission to edit files.

## Start

Run `ooxml --help` to confirm the CLI is installed. If a query says the user is not signed in, run
`ooxml login` and let the user finish the browser flow.

## Choose evidence

- Search prose with `ooxml search "<question>"`. Use `--part` only when the relevant ECMA part is known.
- Fetch a known section with `ooxml section <section-id> [--part <1-4>]`.
- Inspect an element with `ooxml element <qname>`.
- Find legal children with `ooxml children <qname>`.
- Find attributes, including inherited ones, with `ooxml attributes <qname>`.
- Inspect a named type with `ooxml type <qname>` and enum values with `ooxml enum <qname>`.
- Discover namespaces with `ooxml namespace [query]`; use `--uri` for an exact URI.
- Inspect OPC part metadata with `ooxml package-part [query]`.
- Inspect DrawingML preset adjust guides with `ooxml preset-shape <shape>`.

Use schema commands for what markup allows. Use prose search for meaning and documented behavior. Use both
when the question asks whether markup is valid and what it does.

## Report

State which evidence came from schema lookup and which came from specification prose. Preserve edition,
profile, source, section, and application-specific limits shown in the output. If the surfaces disagree,
show the disagreement instead of choosing silently.
