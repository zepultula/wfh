import unittest

def test_filtering_logic():
    # Mock tasks
    tasks = [
        {"id": 1, "title": "Approved Task", "approved": True, "approved_by": "Boss"},
        {"id": 2, "title": "Pending Task", "approved": False, "approved_by": ""},
        {"id": 3, "title": "Rejected Task", "approved": False, "approved_by": "Boss"},
    ]
    
    # Intended logic: approved == True OR approved_by == ""
    filtered = [t for t in tasks if t.get("approved", False) or t.get("approved_by") == ""]
    
    titles = [t["title"] for t in filtered]
    print(f"Filtered titles: {titles}")
    
    assert "Approved Task" in titles
    assert "Pending Task" in titles
    assert "Rejected Task" not in titles
    print("Verification Successful!")

if __name__ == "__main__":
    test_filtering_logic()
