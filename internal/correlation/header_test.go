package correlation

import "testing"

func TestResolveHeader(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{name: "missing", want: DefaultHeader},
		{name: "blank", header: "  ", want: DefaultHeader},
		{name: "custom", header: "  X-Flow-ID  ", want: "X-Flow-ID"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ResolveHeader(test.header); got != test.want {
				t.Fatalf("ResolveHeader(%q) = %q, want %q", test.header, got, test.want)
			}
		})
	}
}

func TestHeaderNamesEqualTrimsAndIgnoresCase(t *testing.T) {
	if !HeaderNamesEqual(" X-Flow-ID ", "x-flow-id") {
		t.Fatal("HeaderNamesEqual() did not trim and ignore casing")
	}
	if HeaderNamesEqual("x-flow-id", "x-other-id") {
		t.Fatal("HeaderNamesEqual() matched different names")
	}
}
