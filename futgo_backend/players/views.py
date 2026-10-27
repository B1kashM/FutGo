
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Player
from .serializers import PlayerSerializer


class PlayerListCreateAPIView(generics.ListCreateAPIView):
    queryset = Player.objects.all().order_by("name")
    serializer_class = PlayerSerializer

    def create(self, request, *args, **kwargs):
        # Accept either one player object or a list of players.
        many = isinstance(request.data, list)

        serializer = self.get_serializer(
            data=request.data,
            many=many
        )
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        headers = self.get_success_headers(serializer.data)

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )


class PlayerDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
