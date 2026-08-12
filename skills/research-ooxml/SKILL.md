---
name: research-ooxml
description: Research published OOXML specification text, schema structure, namespaces, package parts, and preset shapes through the ooxml CLI. Use when an agent needs evidence about valid OOXML markup, element children or attributes, simple-type values, specification sections, or OPC package metadata while implementing or reviewing document tooling.
---

# Research OOXML

Use the `ooxml` CLI to gather evidence. Do not edit files unless the user's request also asks for changes.

## Start

Run `ooxml --help` to confirm the CLI is installed. If a command says the user is not signed in, run
`ooxml login` and wait for the user to finish signing in through the browser.

## Choose evidence

- Search prose with `ooxml search "<question>"`. Use `--part` only when the relevant ECMA part is known.
- Read a known section with `ooxml section <section-id> [--part <1-4>]`.
- Inspect an element with `ooxml element <qname>`.
- Find legal children with `ooxml children <qname>`.
- Find attributes, including inherited ones, with `ooxml attributes <qname>`.
- Inspect a named type with `ooxml type <qname>`.
- List a simple type's allowed values with `ooxml enum <qname>`.
- Discover namespaces with `ooxml namespace [query]`; use `--uri` for an exact URI.
- Inspect OPC part metadata with `ooxml package-part [query]`.
- Inspect DrawingML preset adjust guides with `ooxml preset-shape <shape>`.

Use schema commands to learn what markup allows. Use prose search to learn what the specification says it
means. Use both when the question asks whether markup is valid and what it does.

## Report

Separate schema evidence from specification prose. Keep any edition, profile, source, section, or
application limit shown in the output. If the sources disagree, show the disagreement instead of choosing
silently.
