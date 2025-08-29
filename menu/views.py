from django.shortcuts import render

def index_view(request):
    return render(request, 'menu/index.html')

def manager_view(request):
    return render(request, 'menu/manager.html')