/* =========================================================
   NGÂN HÀNG CÂU HỎI

   Đổi type để chọn dạng câu hỏi. Các dạng được hỗ trợ:
   multiple-choice, radio, visual-choice, fill-in-blank,
   multiple-select, matching, binary, process-order.
========================================================= */

const quiz = {
  id: "demo-001",
  title: "NỘI DUNG BÀI HỌC CĐ3",
  questions: [
    {
      type: "radio",
      category: "Dữ liệu – Thông tin – Kiến thức",
      text: "Câu 1. Tình huống nào sau đây thể hiện đúng quá trình từ dữ liệu → thông tin → kiến thức?",
      options: [
        "Nam nhìn thấy các số 28°C, 30°C, 32°C và cho rằng đây là kiến thức về thời tiết.",
        "Lan ghi lại nhiệt độ trong 3 ngày là 28°C, 30°C, 32°C. Sau khi sắp xếp và nhận thấy nhiệt độ tăng dần, Lan kết luận nhiệt độ đang có xu hướng tăng và quyết định mang theo nước khi ra ngoài.",
        "Minh nhìn thấy số 30°C và cho rằng mọi ngày trong tuần đều có nhiệt độ 30°C.",
        "An nhập các con số vào máy tính nhưng không xem xét hoặc phân tích chúng."
      ],
      correct: 1,
      explain: "Dữ liệu là những sự kiện, con số hoặc thông tin ban đầu chưa được xử lý. Thông tin là dữ liệu đã được tổ chức hoặc xử lý để trở nên có ý nghĩa. Kiến thức là sự hiểu biết được hình thành từ thông tin và có thể áp dụng vào thực tế."
    },
    {
      type: "radio",
      category: "Dữ liệu – Thông tin – Kiến thức khi dùng AI",
      text: "Câu 2. Khi sử dụng AI để tìm hiểu một chủ đề, tình huống nào sau đây thể hiện đúng việc sử dụng dữ liệu, thông tin và kiến thức?",
      options: [
        "Nam nhập câu hỏi vào AI và xem câu trả lời mà không cần quan tâm đến dữ liệu được cung cấp.",
        "Lan cung cấp cho AI dữ liệu về số giờ học của mình, yêu cầu AI phân tích và nhận được thông tin về thời gian học. Sau đó, Lan sử dụng thông tin này để điều chỉnh lịch học.",
        "Minh cho rằng mọi câu trả lời của AI đều là kiến thức chính xác.",
        "An chỉ sử dụng một câu trả lời của AI mà không kiểm tra hoặc suy nghĩ về kết quả."
      ],
      correct: 1,
      explain: "Dữ liệu là thông tin đầu vào được cung cấp cho AI. AI có thể xử lý dữ liệu để tạo ra thông tin hoặc kết quả đầu ra. Con người cần hiểu, đánh giá và áp dụng kết quả để hình thành kiến thức."
    },
    {
      type: "multiple-choice",
      category: "Đánh giá thông tin",
      text: "Câu 3. Khi đánh giá một thông tin trên Internet, yếu tố nào cần được xem xét để biết thông tin đó có đáng sử dụng hay không?",
      options: [
        "Chỉ cần xem thông tin có nhiều hình ảnh đẹp hay không.",
        "Chỉ cần xem thông tin có xuất hiện đầu tiên trong kết quả tìm kiếm hay không.",
        "Xem xét độ chính xác, độ tin cậy, tính hợp lệ và mức độ liên quan của thông tin.",
        "Chọn thông tin có nội dung dài nhất."
      ],
      correct: 2,
      explain: "Khi đánh giá thông tin cần xem xét độ chính xác, độ tin cậy, tính hợp lệ và mức độ liên quan để xác định chất lượng và mức độ phù hợp của thông tin."
    },
    {
      type: "radio",
      category: "Đánh giá kết quả đầu ra của AI",
      text: "Câu 4. AI đưa ra một câu trả lời về một sự kiện lịch sử. Em nên làm gì trước khi sử dụng câu trả lời đó?",
      options: [
        "Sử dụng ngay vì AI luôn đưa ra thông tin chính xác.",
        "Kiểm tra câu trả lời bằng các nguồn thông tin đáng tin cậy khác.",
        "Chọn câu trả lời vì nó được viết rất dài.",
        "Tin vào câu trả lời nếu AI sử dụng nhiều từ chuyên môn."
      ],
      correct: 1,
      explain: "Kết quả do AI tạo ra cần được đánh giá và kiểm tra trước khi sử dụng. AI có thể tạo ra thông tin không chính xác hoặc chưa đầy đủ, vì vậy cần đối chiếu với các nguồn đáng tin cậy."
    },
    {
      type: "radio",
      category: "Quan điểm",
      text: "Câu 5. Tình huống nào sau đây thể hiện một quan điểm?",
      options: [
        "Nước sôi ở nhiệt độ 100°C trong điều kiện áp suất khí quyển tiêu chuẩn.",
        "Trường học bắt đầu tiết học lúc 7 giờ sáng.",
        "Minh nói: “Theo em, học bằng máy tính thú vị hơn học bằng sách.”",
        "Một tuần có 7 ngày."
      ],
      correct: 2,
      explain: "Quan điểm là cách một người suy nghĩ, cảm nhận hoặc đánh giá về một vấn đề. Quan điểm có thể khác nhau giữa những người khác nhau."
    },
    {
      type: "radio",
      category: "Thiên kiến",
      text: "Câu 6. Theo em, tình huống nào sau đây thể hiện thiên kiến (Bias)?",
      options: [
        "Nam tìm hiểu về một chiếc điện thoại từ nhiều nguồn trước khi đưa ra nhận xét.",
        "Lan nhìn thấy một bạn học sinh mặc quần áo cũ và nghĩ: “Bạn ấy chắc học không giỏi.”",
        "Minh tìm hiểu hai sản phẩm, sau đó so sánh giá, tính năng và ưu điểm của từng sản phẩm.",
        "An đọc nhiều ý kiến khác nhau về một vấn đề và kiểm tra nguồn thông tin trước khi đưa ra kết luận."
      ],
      correct: 1,
      explain: "Thiên kiến (Bias) là xu hướng đưa ra nhận xét hoặc đánh giá theo một hướng nhất định dựa trên định kiến, sở thích hoặc giả định, thay vì xem xét thông tin một cách khách quan và đầy đủ."
    },
    {
      type: "radio",
      category: "Thiên kiến trong kết quả AI",
      text: "Câu 7. AI được yêu cầu mô tả một nghề nghiệp và trả lời: “Nghề này chỉ phù hợp với nam giới.” Em nên nhận xét như thế nào?",
      options: [
        "Đây chắc chắn là sự thật vì AI đã trả lời.",
        "Đây có thể là một biểu hiện của thiên kiến vì AI đưa ra nhận xét dựa trên giới tính.",
        "Đây là thông tin chính xác vì câu trả lời rất ngắn gọn.",
        "Không cần kiểm tra vì AI không thể có thiên kiến."
      ],
      correct: 1,
      explain: "Kết quả của AI có thể chứa thiên kiến. Nhận xét rằng một nghề chỉ phù hợp với nam giới dựa trên giới tính có thể là một dạng đánh giá thiên lệch."
    },
    {
      type: "radio",
      category: "Nguồn thông tin",
      text: "Câu 8. Nguồn thông tin là gì?",
      options: [
        "Nơi hoặc tài liệu cung cấp thông tin mà người sử dụng có thể tham khảo.",
        "Một chương trình chỉ dùng để chơi trò chơi.",
        "Một thiết bị chỉ dùng để lưu trữ hình ảnh.",
        "Một câu trả lời mà không cần biết thông tin đến từ đâu."
      ],
      correct: 0,
      explain: "Nguồn thông tin (Information Source) là nơi, người, tài liệu hoặc phương tiện cung cấp thông tin. Nguồn giúp người sử dụng đánh giá độ tin cậy và chất lượng của thông tin."
    },
    {
      type: "radio",
      category: "Giới hạn độ tuổi đối với nội dung kỹ thuật số",
      text: "Câu 9. Một trang web hiển thị nội dung dành cho người dùng từ 13 tuổi trở lên. Nếu một học sinh chưa đủ 13 tuổi muốn truy cập, em nên làm gì?",
      options: [
        "Khai sai tuổi để được truy cập.",
        "Sử dụng tài khoản của người khác.",
        "Tôn trọng giới hạn độ tuổi và hỏi cha mẹ, giáo viên hoặc người lớn đáng tin cậy khi cần.",
        "Chia sẻ đường dẫn cho các bạn nhỏ hơn để cùng truy cập."
      ],
      correct: 2,
      explain: "Một số nội dung và dịch vụ kỹ thuật số có giới hạn độ tuổi để phù hợp với người sử dụng. Người dùng cần tôn trọng yêu cầu về độ tuổi và không nên khai sai thông tin để vượt qua giới hạn."
    },
    {
      type: "radio",
      category: "So sánh kết quả AI với các nguồn thông tin khác",
      text: "Câu 10. AI cho Minh một câu trả lời về một chủ đề khoa học. Minh tìm thấy một thông tin khác trong sách giáo khoa nhưng hai thông tin không giống nhau. Minh nên làm gì?",
      options: [
        "Chọn câu trả lời của AI vì AI có công nghệ hiện đại.",
        "Chọn thông tin trong sách mà không cần kiểm tra.",
        "So sánh hai nguồn, kiểm tra nguồn gốc và tìm thêm nguồn đáng tin cậy để xác định thông tin phù hợp.",
        "Chọn câu trả lời dài hơn."
      ],
      correct: 2,
      explain: "Khi các nguồn thông tin đưa ra kết quả khác nhau, cần so sánh, kiểm tra nguồn gốc và bằng chứng, đồng thời có thể tìm thêm nguồn đáng tin cậy trước khi đưa ra kết luận."
    }
  ]
};
