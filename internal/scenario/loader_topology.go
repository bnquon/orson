package scenario

func edgeID(from, to string) string {
	return "edge:" + from + "->" + to
}

func findCycle(root string, edges []TopologyEdge) ([]string, sourceLocation) {
	adjacency := make(map[string][]TopologyEdge)
	for _, edge := range edges {
		adjacency[edge.From] = append(adjacency[edge.From], edge)
	}

	state := make(map[string]uint8)
	path := make([]string, 0)
	var visit func(string) ([]string, sourceLocation)
	visit = func(topic string) ([]string, sourceLocation) {
		state[topic] = 1
		path = append(path, topic)
		for _, edge := range adjacency[topic] {
			switch state[edge.To] {
			case 1:
				for index, item := range path {
					if item == edge.To {
						return append(append([]string(nil), path[index:]...), edge.To), edge.source
					}
				}
			case 0:
				if cycle, location := visit(edge.To); len(cycle) > 0 {
					return cycle, location
				}
			}
		}
		path = path[:len(path)-1]
		state[topic] = 2
		return nil, sourceLocation{}
	}

	if cycle, location := visit(root); len(cycle) > 0 {
		return cycle, location
	}
	for topic := range adjacency {
		if state[topic] == 0 {
			if cycle, location := visit(topic); len(cycle) > 0 {
				return cycle, location
			}
		}
	}
	return nil, sourceLocation{}
}
