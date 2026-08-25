package correlation

import "strings"

const DefaultHeader = "x-correlation-id"

func ResolveHeader(header string) string {
	header = strings.TrimSpace(header)
	if header == "" {
		return DefaultHeader
	}
	return header
}

func HeaderNamesEqual(left, right string) bool {
	return strings.EqualFold(strings.TrimSpace(left), strings.TrimSpace(right))
}
